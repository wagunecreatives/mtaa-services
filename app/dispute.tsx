import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export default function JobDisputeScreen() {
  const { user } = useAuth();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!user || !jobId || saving) return;
    if (reason.trim().length < 5) { Alert.alert("Add more detail", "Please describe the issue in at least five characters."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("report_job_dispute", { p_job_id: jobId, p_reason: reason.trim() });
      if (error) { Alert.alert("Could not report issue", error.message); return; }
      Alert.alert("Issue reported", "The job is now marked as disputed for platform review.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (error) { Alert.alert("Could not report issue", error instanceof Error ? error.message : "Check your connection and try again."); }
    finally { setSaving(false); }
  };
  return <RouteScaffold eyebrow="Job support" title="Report a job issue" description="Tell us what happened. Only this job’s customer or provider can submit a dispute.">
    <TextInput value={reason} onChangeText={setReason} maxLength={2000} multiline textAlignVertical="top" placeholder="Describe the issue" placeholderTextColor={Colors.textSecondary} style={styles.input} accessibilityLabel="Dispute reason" />
    <TouchableOpacity style={[styles.button, saving && styles.disabled]} disabled={saving} onPress={() => void submit()}>
      {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit dispute</Text>}
    </TouchableOpacity>
  </RouteScaffold>;
}

const styles = StyleSheet.create({ input: { minHeight: 150, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, color: Colors.text, backgroundColor: Colors.backgroundSecondary }, button: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.primary }, buttonText: { color: "#fff", fontWeight: "800" }, disabled: { opacity: 0.55 } });
