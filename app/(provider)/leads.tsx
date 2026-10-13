import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type Lead = {
  request_id: string; category_name: string; area_name: string | null; county: string | null;
  urgency: string | null; title: string | null; description: string | null; match_status: string;
  match_rank: number | null; created_at: string; response_status: string | null; response_id: string | null;
  distance_km: number | null; provider_rating: number | null; provider_available: boolean; verification_status: string;
};

export default function ProviderLeadsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string; notificationId?: string }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const { data, error: loadError } = await supabase.rpc("get_provider_leads");
      if (loadError) setError(loadError.message);
      else { setError(""); setLeads((data ?? []) as Lead[]); }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load leads."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    if (!user) return;
    const channel = supabase.channel(`provider-leads:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);
  useEffect(() => {
    if (params.notificationId) void supabase.rpc("mark_notification_read", { p_notification_id: params.notificationId });
  }, [params.notificationId]);

  const accept = async (lead: Lead) => {
    if (busyId) return;
    setBusyId(lead.request_id);
    try {
      const { error: responseError } = await supabase.rpc("respond_to_service_request", {
        p_request_id: lead.request_id,
        p_message: "I can help with this request and am available to discuss the details.",
        p_quoted_price: null,
        p_estimated_arrival_minutes: null,
      });
      if (responseError) Alert.alert("Could not accept request", responseError.message);
      else await load();
    } catch (responseError) {
      Alert.alert("Could not accept request", responseError instanceof Error ? responseError.message : "Check your connection and try again.");
    } finally { setBusyId(null); }
  };

  const decline = (lead: Lead) => Alert.alert("Decline this request?", "The request will no longer appear in your leads.", [
    { text: "Keep lead", style: "cancel" },
    { text: "Decline", style: "destructive", onPress: async () => {
      if (busyId) return;
      setBusyId(lead.request_id);
      try {
        const { error: declineError } = await supabase.rpc("decline_service_request", { p_request_id: lead.request_id });
        if (declineError) Alert.alert("Could not decline request", declineError.message);
        else await load();
      } catch (declineError) {
        Alert.alert("Could not decline request", declineError instanceof Error ? declineError.message : "Check your connection and try again.");
      } finally { setBusyId(null); }
    } },
  ]);

  const visibleLeads = params.requestId ? leads.filter((lead) => lead.request_id === params.requestId) : leads;
  return <RouteScaffold eyebrow="Provider" title="Leads" description="Nearby requests matched to your services and coverage areas.">
    {loading ? <ActivityIndicator color={Colors.primary} /> : null}
    {!!error && <Text style={styles.muted}>{error}</Text>}
    {!loading && visibleLeads.length === 0 && !error && <Text style={styles.muted}>{params.requestId ? "This lead is no longer available." : "No matched leads yet. New eligible requests will appear here."}</Text>}
    {visibleLeads.map((lead) => <View key={lead.request_id} style={styles.card}>
      <View style={styles.row}><Text style={styles.heading}>🚨 New {lead.category_name} Request</Text><Text style={styles.badge}>{(lead.urgency ?? "standard").toUpperCase()}</Text></View>
      <Text style={styles.label}>Location</Text>
      <Text style={styles.text}>{[lead.area_name, lead.county].filter(Boolean).join(", ") || "Service area"}</Text>
      <Text style={styles.label}>Distance</Text>
      <Text style={styles.text}>{lead.distance_km !== null ? `${lead.distance_km.toFixed(1)} km` : "Within your selected service area"}</Text>
      <Text style={styles.label}>Problem</Text>
      <Text style={styles.text}>{lead.description || lead.title || lead.category_name}</Text>
      {lead.response_id
        ? <Text style={styles.accepted}>Accepted · Customer notified</Text>
        : <View style={styles.actions}>
          <TouchableOpacity style={styles.acceptButton} disabled={busyId !== null} onPress={() => void accept(lead)}>
            <Text style={styles.buttonText}>{busyId === lead.request_id ? "Accepting…" : "ACCEPT"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} disabled={busyId !== null} onPress={() => decline(lead)}>
            <Text style={styles.declineText}>DECLINE</Text>
          </TouchableOpacity>
        </View>}
    </View>)}
  </RouteScaffold>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: Colors.backgroundSecondary, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  heading: { color: Colors.text, fontSize: 17, fontWeight: "800", flex: 1 },
  badge: { color: Colors.error, fontWeight: "800" },
  label: { color: Colors.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  text: { color: Colors.text, fontSize: 15, lineHeight: 21 },
  muted: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  accepted: { color: Colors.success, fontWeight: "800", paddingTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  acceptButton: { flex: 1, minHeight: 48, borderRadius: 11, justifyContent: "center", alignItems: "center", backgroundColor: Colors.primary },
  declineButton: { flex: 1, minHeight: 48, borderRadius: 11, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.error },
  buttonText: { color: "#fff", fontWeight: "800" },
  declineText: { color: Colors.error, fontWeight: "800" },
});
