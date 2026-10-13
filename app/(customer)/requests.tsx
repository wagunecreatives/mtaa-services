import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { registerPushToken, setPushPreference } from "../../lib/pushNotifications";
import { supabase } from "../../lib/supabase";
import type { JobStatus } from "../../lib/reviews";
import { whatsappUrl } from "../../lib/contact";

type Request = { id: string; title: string | null; area_name: string | null; urgency: string | null; status: string; cancellation_reason: string | null; created_at: string };
type Response = { response_id: string; provider_id: string; business_name: string | null; provider_name: string | null; rating_average: number | null; total_reviews: number | null; message: string; quoted_price: number | null; estimated_arrival_minutes: number | null; response_status: string; job_id: string | null; job_status: JobStatus | null; agreed_price: number | null; started_at: string | null; completed_at: string | null; cancelled_at: string | null; provider_contact: string | null; provider_phone: string | null; provider_whatsapp: string | null; distance_km: number | null; provider_available: boolean; verification_status: string; phone_verified: boolean; review_id?: string | null; review_rating?: number | null; review_text?: string | null };
const cancellableRequest = ["open", "matching", "responses_received"];
const cancellableJob: JobStatus[] = ["assigned", "accepted", "on_the_way", "arrived", "in_progress"];
const disputableJob: JobStatus[] = [...cancellableJob, "awaiting_confirmation"];

export default function CustomerRequestsScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [details, setDetails] = useState<Record<string, Response[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadDetails = useCallback(async (requestId: string) => {
    setDetailsError(null);
    try {
      const { data, error } = await supabase.rpc("get_customer_request_details", { p_request_id: requestId });
      if (error) throw error;
      const rows = (data ?? []) as Response[];
      const withReviews = await Promise.all(rows.map(async (row) => {
        if (!row.job_id) return row;
        const { data: review, error: reviewError } = await supabase.rpc("get_job_review_state", { p_job_id: row.job_id });
        if (reviewError) throw reviewError;
        const state = Array.isArray(review) ? review[0] : review;
        return { ...row, review_id: state?.review_id ?? null, review_rating: state?.rating ?? null, review_text: state?.review_text ?? null };
      }));
      setDetails((current) => ({ ...current, [requestId]: withReviews }));
      setDetailsError(null);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Unable to load job details. Please try again.");
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("service_requests").select("id,title,area_name,urgency,status,cancellation_reason,created_at").eq("customer_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Request[];
      setRequests(rows);
      if (expandedId && rows.some((row) => row.id === expandedId)) await loadDetails(expandedId);
    } catch (error) {
      Alert.alert("Could not load requests", error instanceof Error ? error.message : "Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user, expandedId, loadDetails]);

  useEffect(() => {
    if (!user) return;
    void supabase.from("notification_preferences").select("push_enabled").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      setPushEnabled(data?.push_enabled ?? false);
      if (data?.push_enabled) void registerPushToken(user.id).catch(() => {});
    });
  }, [user]);
  const updatePush = async (enabled: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try { await setPushPreference(user.id, enabled); setPushEnabled(enabled); }
    catch (error) { Alert.alert("Notification settings", error instanceof Error ? error.message : "Could not update notifications."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
    if (!user) return;
    const requestsChannel = supabase.channel(`customer-requests:${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "service_requests", filter: `customer_id=eq.${user.id}` }, () => void load()).subscribe();
    const jobsChannel = supabase.channel(`customer-jobs:${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `customer_id=eq.${user.id}` }, () => { void load(); if (expandedId) void loadDetails(expandedId); }).subscribe();
    const notices = supabase.channel(`customer-notices:${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => { void load(); if (expandedId) void loadDetails(expandedId); }).subscribe();
    return () => { void supabase.removeChannel(requestsChannel); void supabase.removeChannel(jobsChannel); void supabase.removeChannel(notices); };
  }, [user, load, loadDetails, expandedId]);

  const toggle = async (request: Request) => {
    if (expandedId === request.id) { setExpandedId(null); return; }
    setExpandedId(request.id);
    await loadDetails(request.id);
  };
  const selectProvider = (response: Response) => Alert.alert("Select provider", `Create a job with ${response.business_name || response.provider_name || "this provider"}?`, [
    { text: "Go back", style: "cancel" },
    { text: "Select", onPress: async () => {
      if (busyId) return;
      setBusyId(response.response_id);
      try {
        const { error } = await supabase.rpc("select_provider_response", { p_response_id: response.response_id });
        if (error) Alert.alert("Could not select provider", error.message);
      else if (expandedId) await load();
      } catch (error) { Alert.alert("Could not select provider", error instanceof Error ? error.message : "Check your connection and try again."); }
      finally { setBusyId(null); }
    } },
  ]);
  const cancel = (request: Request, responseRows: Response[]) => {
    const job = responseRows.find((row) => row.job_id && row.job_status);
    Alert.alert("Cancel service", "This will cancel the request or assigned job.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel service", style: "destructive", onPress: async () => {
        if (busyId) return;
        setBusyId(request.id);
        try {
          const { error } = job?.job_id && job.job_status !== null && cancellableJob.includes(job.job_status)
            ? await supabase.rpc("cancel_job", { p_job_id: job.job_id, p_reason: "Cancelled by customer" })
            : await supabase.rpc("cancel_service_request", { p_request_id: request.id, p_reason: "Cancelled by customer" });
          if (error) Alert.alert("Could not cancel", error.message);
          else await load();
        } catch (error) { Alert.alert("Could not cancel", error instanceof Error ? error.message : "Check your connection and try again."); }
        finally { setBusyId(null); }
      } },
    ]);
  };
  const confirmCompletion = (requestId: string, jobId: string) => Alert.alert("Confirm completed job", "Confirm that the provider finished this job? You can leave a review after confirming.", [
    { text: "Not yet", style: "cancel" },
    { text: "Confirm", onPress: async () => {
      if (busyId) return;
      setBusyId(jobId);
      try {
        const { error } = await supabase.rpc("confirm_job_completion", { p_job_id: jobId });
        if (error) Alert.alert("Could not confirm completion", error.message);
        else { await loadDetails(requestId); await load(); }
      } catch (error) { Alert.alert("Could not confirm completion", error instanceof Error ? error.message : "Check your connection and try again."); }
      finally { setBusyId(null); }
    } },
  ]);

  return <RouteScaffold eyebrow="Customer" title="Your requests" description="Track provider responses, selected providers, and job progress.">
    <TouchableOpacity onPress={() => router.push("/notifications")}><Text style={styles.link}>Open notification center</Text></TouchableOpacity>
    <View style={styles.preference}><View style={styles.copy}><Text style={styles.title}>Push updates</Text><Text style={styles.muted}>Important changes to your service requests</Text></View><Switch value={pushEnabled} onValueChange={updatePush} disabled={busy} /></View>
    {loading ? <ActivityIndicator color={Colors.primary} /> : null}
    {!loading && !requests.length ? <Text style={styles.muted}>You have not submitted any service requests yet.</Text> : null}
    {requests.map((request) => {
      const responseRows = details[request.id] ?? [];
      const availableResponses = responseRows.filter((response) => !response.job_id && response.response_status === "pending");
      const job = responseRows.find((row) => row.job_id);
      const canCancelJob = !!job?.job_status && cancellableJob.includes(job.job_status);
      return <View key={request.id} style={styles.card}>
        <TouchableOpacity onPress={() => void toggle(request)}>
          <Text style={styles.title}>{request.title || "Service request"}</Text>
          <Text style={styles.muted}>{[request.area_name, request.urgency].filter(Boolean).join(" · ")}</Text>
          <Text style={styles.status}>{request.status.replaceAll("_", " ")}</Text>
          {!!request.cancellation_reason && <Text style={styles.muted}>Cancellation reason: {request.cancellation_reason}</Text>}
          <Text style={styles.date}>{new Date(request.created_at).toLocaleString()}</Text>
          <Text style={styles.link}>{expandedId === request.id ? "Hide details" : "View responses and job"}</Text>
        </TouchableOpacity>
        {expandedId === request.id && <View style={styles.details}>
          {!!detailsError && <>
            <Text style={styles.error}>{detailsError}</Text>
            <TouchableOpacity onPress={() => void loadDetails(request.id)}><Text style={styles.link}>Retry loading details</Text></TouchableOpacity>
          </>}
          {job && <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Selected provider</Text>
            <Text style={styles.title}>{job.business_name || job.provider_name || "Provider"}</Text>
            <Text style={styles.muted}>Rating: {job.rating_average?.toFixed(1) ?? "New"} ({job.total_reviews ?? 0} reviews)</Text>
            <Text style={styles.status}>Job: {job.job_status?.replaceAll("_", " ")}</Text>
            {!!job.provider_id && <TouchableOpacity onPress={() => router.push({ pathname: "/report" as never, params: { reportedUserId: job.provider_id, jobId: job.job_id! } })}><Text style={styles.cancelText}>Report provider or service</Text></TouchableOpacity>}
            {job.job_status === "awaiting_confirmation" && <>
              <Text style={styles.muted}>The provider marked this job ready. Confirm when the work is complete.</Text>
              <TouchableOpacity style={styles.primaryButton} disabled={busyId !== null} onPress={() => confirmCompletion(request.id, job.job_id!)}><Text style={styles.primaryText}>{busyId === job.job_id ? "Confirming…" : "Confirm Job Completed"}</Text></TouchableOpacity>
            </>}
            {job.job_status === "completed" && (job.review_id
              ? <Text style={styles.reviewState}>You reviewed this job · {"★".repeat(job.review_rating ?? 0)}</Text>
              : <TouchableOpacity style={styles.primaryButton} onPress={() => router.push({ pathname: "/review" as never, params: { jobId: job.job_id! } })}><Text style={styles.primaryText}>Rate and review provider</Text></TouchableOpacity>)}
            {job.job_id && job.job_status && disputableJob.includes(job.job_status) && <TouchableOpacity style={styles.cancelButton} onPress={() => router.push({ pathname: "/dispute" as never, params: { jobId: job.job_id! } })}><Text style={styles.cancelText}>Report a job issue</Text></TouchableOpacity>}
            {job.agreed_price !== null && <Text style={styles.muted}>Agreed price: KES {job.agreed_price}</Text>}
            {!!job.message && <Text style={styles.body}>{job.message}</Text>}
            {job.estimated_arrival_minutes !== null && <Text style={styles.muted}>Estimated arrival: {job.estimated_arrival_minutes} minutes</Text>}
            {!!job.started_at && <Text style={styles.date}>Started {new Date(job.started_at).toLocaleString()}</Text>}
            {!!job.completed_at && <Text style={styles.date}>Completed {new Date(job.completed_at).toLocaleString()}</Text>}
            {!!job.cancelled_at && <Text style={styles.date}>Cancelled {new Date(job.cancelled_at).toLocaleString()}</Text>}
            {!!job.provider_contact && <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL(`tel:${job.provider_contact}`).catch(() => Alert.alert("Contact unavailable", "This device cannot open the phone app."))}><Text style={styles.secondaryText}>CALL · {job.provider_contact}</Text></TouchableOpacity>}
            {!!(job.provider_whatsapp || job.provider_phone) && <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL(whatsappUrl(job.provider_whatsapp || job.provider_phone!, `Hello, I found you on Mtaa-services. I need help with ${request.title || "a service"} in ${request.area_name || "my area"}.`)).catch(() => Alert.alert("WhatsApp unavailable", "Could not open WhatsApp."))}><Text style={styles.secondaryText}>WHATSAPP</Text></TouchableOpacity>}
          </View>}
          {!job && availableResponses.length === 0 && !detailsError && <Text style={styles.muted}>{responseRows.length ? "No providers available yet." : "No provider responses yet."}</Text>}
          {!job && availableResponses.length > 0 && <Text style={styles.sectionTitle}>{availableResponses.length} {availableResponses.length === 1 ? "provider" : "providers"} available</Text>}
          {availableResponses.map((response) => <View key={response.response_id} style={styles.responseCard}>
            <Text style={styles.sectionTitle}>{response.business_name || response.provider_name || "Provider"}</Text>
            <Text style={styles.muted}>{"\u2B50"} {response.rating_average?.toFixed(1) ?? "New"} {response.total_reviews ? `(${response.total_reviews} reviews)` : ""}</Text>
            <Text style={styles.muted}>{response.verification_status === "verified" && response.phone_verified ? "Verified" : "Unverified"} | {response.distance_km !== null ? `${response.distance_km.toFixed(1)} km` : "Your selected area"} | {response.provider_available ? "Available now" : "Unavailable"}</Text>
            <Text style={styles.body}>{response.message}</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: "/report" as never, params: { reportedUserId: response.provider_id } })}><Text style={styles.cancelText}>Report provider</Text></TouchableOpacity>
            <View style={styles.contactActions}>
              {!!response.provider_phone && <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL(`tel:${response.provider_phone}`).catch(() => Alert.alert("Contact unavailable", "This device cannot open the phone app."))}><Text style={styles.secondaryText}>CALL</Text></TouchableOpacity>}
              {!!(response.provider_whatsapp || response.provider_phone) && <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL(whatsappUrl(response.provider_whatsapp || response.provider_phone!, `Hello, I found you on Mtaa-services. I need help with ${request.title || "a service"} in ${request.area_name || "my area"}.`)).catch(() => Alert.alert("WhatsApp unavailable", "Could not open WhatsApp."))}><Text style={styles.secondaryText}>WHATSAPP</Text></TouchableOpacity>}
            </View>
            {cancellableRequest.includes(request.status) && <TouchableOpacity style={styles.primaryButton} disabled={busyId !== null} onPress={() => selectProvider(response)}><Text style={styles.primaryText}>{busyId === response.response_id ? "Selecting..." : "Select provider"}</Text></TouchableOpacity>}
          </View>)}
          {(cancellableRequest.includes(request.status) || canCancelJob) && <TouchableOpacity style={styles.cancelButton} disabled={busyId !== null} onPress={() => cancel(request, responseRows)}><Text style={styles.cancelText}>Cancel request</Text></TouchableOpacity>}
        </View>}
      </View>;
    })}
  </RouteScaffold>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, gap: 9 }, title: { color: Colors.text, fontSize: 16, fontWeight: "800" }, muted: { color: Colors.textSecondary, lineHeight: 19 }, error: { color: Colors.error, lineHeight: 19 }, status: { color: Colors.primary, fontWeight: "800", textTransform: "capitalize" }, date: { color: Colors.textSecondary, fontSize: 12 }, link: { color: Colors.primary, fontWeight: "800" }, preference: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 14 }, copy: { flex: 1, gap: 4 }, details: { gap: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 }, jobCard: { padding: 12, borderRadius: 12, backgroundColor: Colors.background, gap: 6 }, contactActions: { flexDirection: "row", gap: 8 }, responseCard: { padding: 12, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, gap: 7 }, sectionTitle: { color: Colors.text, fontWeight: "800" }, body: { color: Colors.text, lineHeight: 21 }, primaryButton: { minHeight: 44, borderRadius: 10, justifyContent: "center", alignItems: "center", backgroundColor: Colors.primary }, primaryText: { color: "#fff", fontWeight: "800" }, reviewState: { color: Colors.primary, fontWeight: "800" }, secondaryButton: { minHeight: 42, borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, justifyContent: "center", alignItems: "center" }, secondaryText: { color: Colors.primary, fontWeight: "800" }, cancelButton: { padding: 10, alignItems: "center" }, cancelText: { color: Colors.error, fontWeight: "800" } });
