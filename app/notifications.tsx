import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

type Notice = { id: string; event_type: string; request_id: string | null; title: string; body: string; data: { screen?: string; requestId?: string; jobId?: string }; read_at: string | null; created_at: string };
export default function NotificationsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    let query = supabase.from("notifications").select("id,event_type,request_id,title,body,data,read_at,created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (params.requestId) query = query.eq("request_id", params.requestId);
    const { data, error: loadError } = await query;
    if (loadError) {
      setError("Could not load notifications. Check your connection and try again.");
    } else {
      setItems((data ?? []) as Notice[]);
      setError(null);
    }
    setLoading(false);
  }, [user, params.requestId]);
  useEffect(() => {
    void Promise.resolve().then(load);
    if (!user) return;
    const channel = supabase.channel(`notifications:${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);
  const open = async (notice: Notice) => {
    const { error: readError } = await supabase.rpc("mark_notification_read", { p_notification_id: notice.id });
    if (readError) Alert.alert("Notification update failed", readError.message);
    setItems((current) => current.map((item) => item.id === notice.id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
    if (notice.event_type === "report_update") return;
    if (notice.event_type === "review_reminder" && notice.data?.jobId) router.push({ pathname: "/(customer)/review", params: { jobId: notice.data.jobId } });
    else if (notice.data?.screen === "/(provider)/leads") router.push({ pathname: "/(provider)/leads", params: { requestId: notice.data.requestId ?? notice.request_id ?? undefined, notificationId: notice.id } });
    else if (notice.data?.screen === "/(provider)/jobs") router.push({ pathname: "/(provider)/jobs", params: { jobId: notice.data.jobId } });
    else if (notice.data?.screen === "/(provider)/monetization") router.push("/(provider)/monetization" as never);
    else router.push("/(customer)/requests");
  };
  return <RouteScaffold eyebrow="Account" title="Notifications" description="Your request updates and matched service leads.">
    {loading ? <ActivityIndicator color={Colors.primary} /> : null}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !items.length ? <Text style={styles.muted}>No notifications yet.</Text> : null}
    {items.map((notice) => <TouchableOpacity key={notice.id} style={[styles.card, !notice.read_at && styles.unread]} onPress={() => void open(notice)}>
      <Text style={styles.title}>{notice.title}</Text><Text style={styles.body}>{notice.body}</Text><Text style={styles.date}>{new Date(notice.created_at).toLocaleString()}</Text>
      {!notice.read_at ? <Text style={styles.unreadLabel}>Unread</Text> : null}
    </TouchableOpacity>)}
  </RouteScaffold>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, gap: 7 }, unread: { borderColor: Colors.primary }, title: { color: Colors.text, fontWeight: "800", fontSize: 16 }, body: { color: Colors.textSecondary, lineHeight: 20 }, date: { color: Colors.textSecondary, fontSize: 12 }, unreadLabel: { color: Colors.primary, fontWeight: "700", fontSize: 12 }, muted: { color: Colors.textSecondary }, error: { color: Colors.error, lineHeight: 20 } });
