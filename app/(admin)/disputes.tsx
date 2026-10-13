import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { supabase } from "../../lib/supabase";

type Dispute = { id: string; job_id: string; raised_by: string; reason: string; status: string; created_at: string; customer_name: string | null; provider_name: string | null; job_status: string; category: string | null; area_name: string | null };
const actions = ["under_review", "resolved", "dismissed"] as const;

export default function AdminDisputesScreen() {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_list_job_disputes", { p_status: null });
      if (rpcError) throw rpcError;
      setRows((data ?? []) as Dispute[]);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load disputes."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const update = async (status: typeof actions[number]) => {
    if (!selected || busy) return;
    if (notes.trim().length < 5) { Alert.alert("Add a handling note", "Enter at least five characters before updating this dispute."); return; }
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("admin_update_job_dispute", { p_dispute_id: selected.id, p_status: status, p_notes: notes.trim() });
      if (rpcError) throw rpcError;
      setSelected(null); setNotes(""); await load();
    } catch (e) { Alert.alert("Could not update dispute", e instanceof Error ? e.message : "Try again."); }
    finally { setBusy(false); }
  };
  return <RouteScaffold eyebrow="Platform administration" title="Job disputes" description="Review participant reports and record an auditable resolution.">
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !error && rows.length === 0 && <Text style={styles.muted}>No job disputes have been reported.</Text>}
    {rows.map((row) => <View key={row.id} style={styles.card}>
      <Text style={styles.heading}>{row.category || "Service job"} · {row.status.replaceAll("_", " ")}</Text>
      <Text style={styles.muted}>{row.customer_name || "Customer"} ↔ {row.provider_name || "Provider"}</Text>
      <Text style={styles.muted}>{[row.area_name, row.job_status.replaceAll("_", " ")].filter(Boolean).join(" · ")}</Text>
      <Text style={styles.reason}>{row.reason}</Text>
      <Text style={styles.date}>Reported {new Date(row.created_at).toLocaleString()}</Text>
      {!selected && row.status !== "resolved" && row.status !== "dismissed" && <TouchableOpacity style={styles.button} onPress={() => { setSelected(row); setNotes(""); }}><Text style={styles.buttonText}>Handle dispute</Text></TouchableOpacity>}
      {selected?.id === row.id && <View style={styles.form}>
        <TextInput value={notes} onChangeText={setNotes} maxLength={2000} multiline placeholder="Admin handling note" placeholderTextColor={Colors.textSecondary} style={styles.input} />
        {actions.map((action) => <TouchableOpacity key={action} style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void update(action)}><Text style={styles.buttonText}>{action.replaceAll("_", " ")}</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.muted}>Close</Text></TouchableOpacity>
      </View>}
    </View>)}
  </RouteScaffold>;
}

const styles = StyleSheet.create({ card: { padding: 15, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary }, heading: { color: Colors.text, fontSize: 16, fontWeight: "800", textTransform: "capitalize" }, muted: { color: Colors.textSecondary, lineHeight: 20 }, reason: { color: Colors.text, lineHeight: 21 }, date: { color: Colors.textSecondary, fontSize: 12 }, error: { color: Colors.error }, form: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }, input: { minHeight: 80, padding: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text }, button: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: Colors.primary }, buttonText: { color: "#fff", fontWeight: "700", textTransform: "capitalize" }, disabled: { opacity: 0.5 } });
