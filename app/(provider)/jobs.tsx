import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { JobReview, JobStatus } from "../../lib/reviews";
import { ContactActions } from "../../components/ContactActions";
import { getServiceLifecycleStatus, ServiceStatusTimeline } from "../../components/ServiceStatusTimeline";
import { confirmBlockUser } from "../../lib/userSafety";

type Job = { job_id: string; request_id: string; customer_id: string; customer_name: string | null; customer_phone: string | null; category_name: string | null; title: string | null; description: string | null; address: string | null; area_name: string | null; county: string | null; latitude: number | null; longitude: number | null; urgency: string; preferred_time: string | null; budget_min: number | null; budget_max: number | null; status: JobStatus; agreed_price: number | null; started_at: string | null; completed_at: string | null; cancelled_at: string | null; cancellation_reason: string | null; created_at: string; review?: JobReview };
const activeStatuses: JobStatus[] = ["assigned", "accepted", "on_the_way", "arrived", "in_progress", "awaiting_confirmation"];
const cancellableStatuses: JobStatus[] = ["assigned", "accepted", "on_the_way", "arrived", "in_progress"];
const disputableStatuses: JobStatus[] = [...cancellableStatuses, "awaiting_confirmation"];
const actionForStatus: Partial<Record<JobStatus, { action: string; label: string }[]>> = {
  assigned: [{ action: "accept", label: "Accept job" }],
  accepted: [{ action: "on_the_way", label: "On the way" }, { action: "start", label: "Start job" }],
  on_the_way: [{ action: "arrived", label: "Mark arrived" }],
  arrived: [{ action: "start", label: "Start job" }],
  in_progress: [{ action: "complete", label: "Ready for customer" }],
};

export default function ProviderJobsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ jobId?: string; notificationId?: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "completed" | "closed">("active");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const { data, error: loadError } = await supabase.rpc("get_provider_jobs");
      if (loadError) setError(loadError.message);
      else {
        const { data: reviews } = await supabase.rpc("get_provider_job_reviews");
        const reviewByJob = new Map(((reviews ?? []) as JobReview[]).map((review) => [review.job_id, review]));
        setJobs(((data ?? []) as Job[]).map((job) => ({ ...job, review: reviewByJob.get(job.job_id) })));
        setError("");
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load jobs."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    if (!user) return;
    const jobsChannel = supabase.channel(`provider-jobs:${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `provider_id=eq.${user.id}` }, () => void load()).subscribe();
    const notifications = supabase.channel(`provider-job-notices:${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(jobsChannel); void supabase.removeChannel(notifications); };
  }, [user, load]);
  useEffect(() => {
    if (params.notificationId) void supabase.rpc("mark_notification_read", { p_notification_id: params.notificationId });
  }, [params.notificationId]);
  const perform = async (job: Job, action: string) => {
    if (busyId) return;
    setBusyId(job.job_id);
    try {
      const { error: actionError } = await supabase.rpc("advance_job", { p_job_id: job.job_id, p_action: action });
      if (actionError) Alert.alert("Job update failed", actionError.message);
      else await load();
    } catch (actionError) { Alert.alert("Job update failed", actionError instanceof Error ? actionError.message : "Please try again."); }
    finally { setBusyId(null); }
  };
  const cancel = (job: Job) => Alert.alert("Cancel job", "The customer will be notified that you cancelled this job.", [
    { text: "Keep job", style: "cancel" },
    { text: "Cancel job", style: "destructive", onPress: async () => {
      if (busyId) return;
      setBusyId(job.job_id);
      try {
        const { error: cancelError } = await supabase.rpc("cancel_job", { p_job_id: job.job_id, p_reason: "Cancelled by provider" });
        if (cancelError) Alert.alert("Cancellation failed", cancelError.message);
        else await load();
      } catch (cancelError) { Alert.alert("Cancellation failed", cancelError instanceof Error ? cancelError.message : "Please try again."); }
      finally { setBusyId(null); }
    } },
  ]);
  const selectedJob = params.jobId ? jobs.find((job) => job.job_id === params.jobId) : undefined;
  const effectiveFilter = selectedJob ? activeStatuses.includes(selectedJob.status) ? "active" : selectedJob.status === "completed" ? "completed" : "closed" : filter;
  const visible = params.jobId ? jobs.filter((job) => job.job_id === params.jobId) : jobs.filter((job) => filter === "active" ? activeStatuses.includes(job.status) : filter === "completed" ? job.status === "completed" : job.status === "cancelled" || job.status === "disputed");

  return <RouteScaffold eyebrow="Provider" title="Jobs" description="Manage assigned jobs through completion.">
    <View style={styles.filters}>
      {(["active", "completed", "closed"] as const).map((value) => <TouchableOpacity key={value} style={[styles.filter, effectiveFilter === value && styles.activeFilter]} onPress={() => setFilter(value)}><Text style={[styles.filterText, effectiveFilter === value && styles.activeFilterText]}>{value === "active" ? "Active jobs" : value === "completed" ? "Completed" : "Closed"}</Text></TouchableOpacity>)}
    </View>
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.muted}>{error}</Text>}
    {!loading && !visible.length && !error && <Text style={styles.muted}>No {filter} jobs yet.</Text>}
    {visible.map((job) => <View key={job.job_id} style={styles.card}>
      <View style={styles.row}><Text style={styles.heading}>{job.category_name || "Service job"}</Text><Text style={styles.status}>{getServiceLifecycleStatus(job.status, "job")}</Text></View>
      <ServiceStatusTimeline status={job.status} source="job" />
      <Text style={styles.title}>{job.title || "Service request"}</Text>
      <Text style={styles.text}>Customer: {job.customer_name || "Customer"}</Text>
      <ContactActions
        phone={job.customer_phone}
        service={job.category_name || job.title}
        area={job.area_name || job.county}
        destination={{
          latitude: job.latitude,
          longitude: job.longitude,
          address: job.address,
          areaName: job.area_name,
          county: job.county,
        }}
      />
      <TouchableOpacity style={styles.cancelButton} onPress={() => confirmBlockUser(job.customer_id, job.customer_name || "this customer")}>
        <Text style={styles.cancelText}>Block customer</Text>
      </TouchableOpacity>
      {!!job.description && <Text style={styles.muted}>{job.description}</Text>}
      <Text style={styles.muted}>Location: {[job.address, job.area_name, job.county].filter(Boolean).join(", ") || "Not provided"}</Text>
      <Text style={styles.muted}>Urgency: {job.urgency}</Text>
      {!!job.preferred_time && <Text style={styles.muted}>Preferred time: {job.preferred_time}</Text>}
      {(job.budget_min !== null || job.budget_max !== null) && <Text style={styles.muted}>Budget: KES {job.budget_min ?? "—"}–{job.budget_max ?? "—"}</Text>}
      {job.agreed_price !== null && <Text style={styles.muted}>Agreed price: KES {job.agreed_price}</Text>}
      <Text style={styles.date}>Assigned {new Date(job.created_at).toLocaleString()}</Text>
      {!!job.started_at && <Text style={styles.date}>Started {new Date(job.started_at).toLocaleString()}</Text>}
      {!!job.completed_at && <Text style={styles.date}>Completed {new Date(job.completed_at).toLocaleString()}</Text>}
      {job.status === "awaiting_confirmation" && <Text style={styles.pending}>You marked this ready. The customer must confirm completion.</Text>}
      {!!job.review && <View style={styles.review}><Text style={styles.reviewTitle}>Customer review · {"★".repeat(job.review.rating)}</Text>{!!job.review.review_text && <Text style={styles.muted}>{job.review.review_text}</Text>}</View>}
      {!!job.cancelled_at && <Text style={styles.date}>Cancelled {new Date(job.cancelled_at).toLocaleString()}{job.cancellation_reason ? ` · ${job.cancellation_reason}` : ""}</Text>}
      {actionForStatus[job.status]?.map((item) => <TouchableOpacity key={item.action} style={styles.primaryButton} disabled={busyId !== null} onPress={() => void perform(job, item.action)}><Text style={styles.primaryText}>{busyId === job.job_id ? "Updating…" : item.label}</Text></TouchableOpacity>)}
      {cancellableStatuses.includes(job.status) && <TouchableOpacity style={styles.cancelButton} disabled={busyId !== null} onPress={() => cancel(job)}><Text style={styles.cancelText}>Cancel job</Text></TouchableOpacity>}
      {disputableStatuses.includes(job.status) && <TouchableOpacity style={styles.cancelButton} onPress={() => router.push({ pathname: "/dispute" as never, params: { jobId: job.job_id } })}><Text style={styles.disputed}>Report a job issue</Text></TouchableOpacity>}
      <TouchableOpacity style={styles.cancelButton} onPress={() => router.push({ pathname: "/report" as never, params: { reportedUserId: job.customer_id, jobId: job.job_id } })}><Text style={styles.cancelText}>Report account or service</Text></TouchableOpacity>
      {job.status === "disputed" && <Text style={styles.disputed}>This job is under dispute. Contact support for next steps.</Text>}
    </View>)}
  </RouteScaffold>;
}
const styles = StyleSheet.create({ filters: { flexDirection: "row", gap: 8 }, filter: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: Colors.border }, activeFilter: { backgroundColor: Colors.primary, borderColor: Colors.primary }, filterText: { color: Colors.textSecondary, fontWeight: "700" }, activeFilterText: { color: "#fff" }, card: { padding: 16, gap: 9, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, heading: { fontSize: 17, color: Colors.text, fontWeight: "800", flex: 1 }, title: { color: Colors.text, fontWeight: "700" }, text: { color: Colors.text }, muted: { color: Colors.textSecondary, lineHeight: 20 }, status: { color: Colors.primary, textTransform: "capitalize", fontWeight: "800" }, date: { color: Colors.textSecondary, fontSize: 12 }, link: { color: Colors.primary, fontWeight: "800" }, primaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: Colors.primary }, primaryText: { color: "#fff", fontWeight: "800" }, cancelButton: { alignItems: "center", padding: 8 }, cancelText: { color: Colors.error, fontWeight: "700" }, pending: { color: Colors.warning, fontWeight: "700" }, review: { padding: 12, gap: 5, borderRadius: 10, backgroundColor: Colors.background }, reviewTitle: { color: Colors.primary, fontWeight: "800" }, disputed: { color: Colors.warning, fontWeight: "700" } });
