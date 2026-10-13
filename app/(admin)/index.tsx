import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { adminApi, type AdminRecord } from "../../lib/admin";

const metrics: [string, string][] = [
  ["Customers", "customers"], ["Providers", "providers"], ["Verified providers", "verified_providers"],
  ["Open requests", "open_requests"], ["Active jobs", "active_jobs"], ["Completed jobs", "completed_jobs"],
  ["Cancellation rate", "cancellation_rate"], ["Average provider rating", "average_provider_rating"],
];
const sections = [
  ["Applications", "applications"], ["Providers", "providers"], ["Customers", "customers"],
  ["Requests & matching", "requests"], ["Reports & disputes", "reports"], ["Reviews", "reviews"],
  ["Categories", "categories"], ["Service areas", "areas"], ["Audit trail", "audit"],
] as const;

export default function AdminHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AdminRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminApi.metrics()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load platform metrics."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <RouteScaffold eyebrow="Platform administration" title="Dashboard" description={`Signed in as ${profile?.role ?? "administrator"}. Sensitive actions are authorized by Supabase RPCs.`}>
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <View style={styles.metrics}>{metrics.map(([label, key]) => <View key={key} style={styles.metric}><Text style={styles.metricValue}>{data?.[key] == null ? "—" : key.endsWith("rate") ? `${data[key]}%` : String(data[key])}</Text><Text style={styles.metricLabel}>{label}</Text></View>)}</View>
    {profile?.role === "super_admin" && <Text style={styles.superAdmin}>Super-admin controls are enabled for this account.</Text>}
    <Text style={styles.sectionHeading}>Platform management</Text>
    <View style={styles.actions}>{sections.map(([label, section]) => <TouchableOpacity key={section} accessibilityRole="button" style={styles.action}
      onPress={() => router.push(`/(admin)/platform?section=${section}` as Href)}>
      <Text style={styles.actionText}>{label}</Text><Text style={styles.chevron}>›</Text>
    </TouchableOpacity>)}
      <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => router.push("/(admin)/jobs" as Href)}><Text style={styles.actionText}>Job investigations</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => router.push("/(admin)/disputes" as Href)}><Text style={styles.actionText}>Job disputes</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
    </View>
    <Text style={styles.sectionHeading}>Jobs by category</Text>
    {Array.isArray(data?.jobs_by_category) && (data.jobs_by_category as AdminRecord[]).map((entry, i) => <Text key={`${String(entry.category)}-${i}`} style={styles.row}>{String(entry.category)} · {String(entry.jobs)} jobs</Text>)}
    <Text style={styles.sectionHeading}>Jobs by area</Text>
    {Array.isArray(data?.jobs_by_area) && (data.jobs_by_area as AdminRecord[]).slice(0, 8).map((entry, i) => <Text key={`${String(entry.area)}-${i}`} style={styles.row}>{String(entry.area)} · {String(entry.jobs)} jobs</Text>)}
  </RouteScaffold>;
}

const styles = StyleSheet.create({ metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { width: "47%", minHeight: 84, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, justifyContent: "center" }, metricValue: { color: Colors.primary, fontSize: 23, fontWeight: "900" }, metricLabel: { marginTop: 4, color: Colors.textSecondary, fontSize: 12 }, sectionHeading: { marginTop: 12, color: Colors.text, fontSize: 18, fontWeight: "800" }, actions: { gap: 8 }, action: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, backgroundColor: Colors.backgroundSecondary, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, actionText: { color: Colors.text, fontWeight: "700" }, chevron: { color: Colors.primary, fontSize: 24 }, row: { color: Colors.textSecondary, paddingVertical: 4 }, error: { color: Colors.error }, superAdmin: { color: Colors.success, fontWeight: "700" } });
