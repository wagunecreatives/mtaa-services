import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

const reasons = [["fraud","Fraud"],["bad_service","Bad service"],["fake_provider","Fake provider"],["harassment","Harassment"],["incorrect_information","Incorrect information"],["spam","Spam"]] as const;
export default function ReportScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ reportedUserId?: string; jobId?: string }>();
  const [type, setType] = useState<(typeof reasons)[number][0]>("bad_service");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!user || busy) return;
    if (description.trim().length < 5) { Alert.alert("Add more detail", "Describe the issue in at least five characters."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_user_report", {
        p_report_type: type,
        p_description: description.trim(),
        p_reported_user_id: params.reportedUserId || null,
        p_job_id: params.jobId || null,
      });
      if (error) throw error;
      Alert.alert("Report submitted", "Our team will investigate your report.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (error) { Alert.alert("Could not submit report", error instanceof Error ? error.message : "Check your connection and try again."); }
    finally { setBusy(false); }
  };
  return <RouteScaffold eyebrow="Trust & safety" title="Report an issue" description="Reports are private and reviewed by the MTAA SERVICES team.">
    <Text style={styles.label}>What happened?</Text>
    <View style={styles.reasons}>{reasons.map(([value,label]) => <TouchableOpacity key={value} style={[styles.reason, type===value && styles.selected]} onPress={() => setType(value)} accessibilityRole="radio" accessibilityState={{selected:type===value}}><Text style={[styles.reasonText,type===value&&styles.selectedText]}>{label}</Text></TouchableOpacity>)}</View>
    <TextInput value={description} onChangeText={setDescription} maxLength={3000} multiline textAlignVertical="top" placeholder="Share what happened and when. Avoid including passwords or payment PINs." placeholderTextColor={Colors.textSecondary} style={styles.input} accessibilityLabel="Report details" />
    <TouchableOpacity style={[styles.button,busy&&styles.disabled]} onPress={() => void submit()} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit report</Text>}</TouchableOpacity>
  </RouteScaffold>;
}
const styles=StyleSheet.create({label:{color:Colors.text,fontWeight:"800",fontSize:16},reasons:{flexDirection:"row",flexWrap:"wrap",gap:8},reason:{paddingHorizontal:12,paddingVertical:9,borderWidth:1,borderColor:Colors.border,borderRadius:20},selected:{backgroundColor:Colors.primary,borderColor:Colors.primary},reasonText:{color:Colors.textSecondary,fontWeight:"700"},selectedText:{color:"#fff"},input:{minHeight:140,padding:14,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,backgroundColor:Colors.backgroundSecondary},button:{minHeight:48,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:Colors.primary},buttonText:{color:"#fff",fontWeight:"800"},disabled:{opacity:.55}});
