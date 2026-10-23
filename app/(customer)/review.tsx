import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

export default function JobReviewScreen() {
  const { user } = useAuth();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [traits, setTraits] = useState({ onTime: false, professional: false, affordable: false, helpful: false });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user || !jobId || saving) return;
    if (rating < 1 || rating > 5) { Alert.alert("Choose a rating", "Select from one to five stars."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("submit_job_review", {
        p_job_id: jobId,
        p_rating: rating,
        p_review_text: reviewText.trim() || null,
        p_on_time: traits.onTime,
        p_professional: traits.professional,
        p_affordable: traits.affordable,
        p_helpful: traits.helpful,
      });
      if (error) { Alert.alert("Could not submit review", error.message); return; }
      Alert.alert("Review submitted", "Thanks for sharing your experience.", [{ text: "Done", onPress: () => router.replace("/(customer)/requests") }]);
    } catch (error) {
      Alert.alert("Could not submit review", error instanceof Error ? error.message : "Check your connection and try again.");
    } finally { setSaving(false); }
  };

  return <RouteScaffold eyebrow="Customer" title="How was your experience?" description="Your feedback becomes part of this provider's reputation and helps other customers choose with confidence.">
    {!jobId ? <Text style={styles.error}>This review link is missing a job.</Text> : <>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rate the provider from one to five stars">
        {[1, 2, 3, 4, 5].map((value) => <TouchableOpacity key={value} onPress={() => setRating(value)} accessibilityRole="radio" accessibilityState={{ selected: rating === value }} accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}>
          <Text style={[styles.star, value <= rating && styles.selectedStar]}>★</Text>
        </TouchableOpacity>)}
      </View>
      <Text style={styles.label}>Was the provider:</Text>
      {([
        ["onTime", "On time"],
        ["professional", "Professional"],
        ["affordable", "Affordable"],
        ["helpful", "Helpful"],
      ] as const).map(([key, label]) => <TouchableOpacity key={key} style={styles.trait} onPress={() => setTraits((current) => ({ ...current, [key]: !current[key] }))} accessibilityRole="checkbox" accessibilityState={{ checked: traits[key] }}>
        <Text style={[styles.checkbox, traits[key] && styles.checked]}>{traits[key] ? "✓" : ""}</Text>
        <Text style={styles.traitText}>{label}</Text>
      </TouchableOpacity>)}
      <Text style={styles.label}>Write review</Text>
      <TextInput
        value={reviewText}
        onChangeText={setReviewText}
        maxLength={2000}
        multiline
        textAlignVertical="top"
        placeholder="Share a few details about your experience..."
        placeholderTextColor={Colors.textSecondary}
        style={styles.input}
        accessibilityLabel="Review text"
      />
      <TouchableOpacity style={[styles.submit, (saving || rating === 0) && styles.disabled]} disabled={saving || rating === 0} onPress={() => void submit()}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit review</Text>}
      </TouchableOpacity>
    </>}
  </RouteScaffold>;
}

const styles = StyleSheet.create({
  label: { color: Colors.text, fontWeight: "800", fontSize: 16 },
  stars: { flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  star: { color: Colors.border, fontSize: 42 },
  selectedStar: { color: Colors.warning },
  trait: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 42 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: Colors.border, textAlign: "center", color: "#fff", overflow: "hidden" },
  checked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  traitText: { color: Colors.text, fontWeight: "600" },
  input: { minHeight: 130, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  submit: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.primary },
  submitText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.55 },
  error: { color: Colors.error },
});
