import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { adminApi, type AdminRecord } from "../../lib/admin";

const filters = ["", "assigned", "accepted", "on_the_way", "arrived", "in_progress", "awaiting_confirmation", "completed", "cancelled", "disputed"];
const field = (record: AdminRecord, key: string) => record[key] == null || record[key] === "" ? "—" : String(record[key]);
const nested = (record: AdminRecord, key: string): AdminRecord => record[key] && typeof record[key] === "object" ? record[key] as AdminRecord : {};

export default function AdminJobsScreen() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobs, setJobs] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setJobs(await adminApi.filterJobs({ status, category, area, provider, from, to })); setError(""); }
    catch (e) { setJobs([]); setError(e instanceof Error ? e.message : "Unable to load jobs."); }
    finally { setLoading(false); }
  }, [status, category, area, provider, from, to]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <RouteScaffold eyebrow="Admin" title="Job investigations" description="Filter jobs by status, category ID, area, provider ID, and creation date. Response and review details are included for authorized administrators.">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {filters.map((value) => <Text key={value || "all"} onPress={() => setStatus(value)} style={[styles.filter, value === status && styles.activeFilter]}>{(value || "all").replaceAll("_", " ")}</Text>)}
    </ScrollView>
    <TextInput value={category} onChangeText={setCategory} placeholder="Category name or ID" placeholderTextColor={Colors.textLight} style={styles.input} />
    <TextInput value={area} onChangeText={setArea} placeholder="Area contains…" placeholderTextColor={Colors.textLight} style={styles.input} />
    <TextInput value={provider} onChangeText={setProvider} placeholder="Provider business name or ID" placeholderTextColor={Colors.textLight} style={styles.input} />
    <TextInput value={from} onChangeText={setFrom} placeholder="From date (YYYY-MM-DD)" placeholderTextColor={Colors.textLight} style={styles.input} />
    <TextInput value={to} onChangeText={setTo} placeholder="To date (YYYY-MM-DD)" placeholderTextColor={Colors.textLight} style={styles.input} />
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.muted}>{error}</Text>}
    {!loading && jobs.length === 0 && !error && <Text style={styles.muted}>No jobs match these filters.</Text>}
    {jobs.map((job) => {
      const response = nested(job, "response"); const review = nested(job, "review");
      return <View key={field(job,"job_id")} style={styles.card}>
        <Text style={styles.heading}>{field(job,"title")}</Text><Text style={styles.status}>{field(job,"status").replaceAll("_", " ")}</Text>
        <Text style={styles.text}>Customer: {field(job,"customer_name")} · {field(job,"customer_id")}</Text>
        <Text style={styles.text}>Provider: {field(job,"business_name")} · {field(job,"provider_id")}</Text>
        <Text style={styles.muted}>Category: {field(job,"category")} · Area: {field(job,"area_name")}, {field(job,"county")}</Text>
        {job.agreed_price != null && <Text style={styles.muted}>Agreed price: KES {field(job,"agreed_price")}</Text>}
        <Text style={styles.date}>Created {field(job,"created_at")}</Text>
        {job.started_at != null && <Text style={styles.date}>Started {field(job,"started_at")}</Text>}
        {job.completed_at != null && <Text style={styles.date}>Completed {field(job,"completed_at")}</Text>}
        {job.cancelled_at != null && <Text style={styles.date}>Cancelled {field(job,"cancelled_at")}</Text>}
        {job.cancellation_reason != null && <Text style={styles.reason}>Cancellation reason: {field(job,"cancellation_reason")}</Text>}
        {response.status != null && <Text style={styles.muted}>Response: {field(response,"status")} · {field(response,"message")}{response.quoted_price != null ? ` · KES ${field(response,"quoted_price")}` : ""}</Text>}
        {review.rating != null && <Text style={styles.review}>Review: {"★".repeat(Number(review.rating))}{review.review_text ? ` · ${field(review,"review_text")}` : ""} · {review.is_visible ? "visible" : "hidden"}</Text>}
      </View>;
    })}
  </RouteScaffold>;
}

const styles = StyleSheet.create({ filters: { gap: 8, paddingBottom: 4 }, filter: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, color: Colors.textSecondary, textTransform: "capitalize" }, activeFilter: { backgroundColor: Colors.primary, borderColor: Colors.primary, color: "#fff" }, input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text }, card: { padding: 15, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, gap: 7 }, heading: { color: Colors.text, fontWeight: "800", fontSize: 17 }, status: { color: Colors.primary, fontWeight: "800", textTransform: "capitalize" }, text: { color: Colors.text }, muted: { color: Colors.textSecondary }, date: { color: Colors.textSecondary, fontSize: 12 }, reason: { color: Colors.error, lineHeight: 20 }, review: { color: Colors.primary, lineHeight: 20 } });
