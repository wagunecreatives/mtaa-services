import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import { supabase } from "../../lib/supabase";

type CachedCategory = { id: string; name: string };
const categoryCacheKey = (slug: string) => `mtaa.category.v1.${slug}`;

async function findCategory(slug: string): Promise<CachedCategory> {
  const { data, error } = await supabase
    .from("service_categories")
    .select("id,name")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!error && data) {
    const category = data as CachedCategory;
    void SecureStore.setItemAsync(categoryCacheKey(slug), JSON.stringify(category)).catch(() => {});
    return category;
  }

  // Use a previously verified category only if the network query failed.
  try {
    const cached = await SecureStore.getItemAsync(categoryCacheKey(slug));
    if (cached) {
      const parsed = JSON.parse(cached) as CachedCategory;
      if (parsed.id && parsed.name) return parsed;
    }
  } catch {
    // A cache failure should not hide the actual network error.
  }
  throw new Error(
    "We couldn't reach the service list. Check your internet connection and try again."
  );
}

export default function ConfirmationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, reset, submissionId, ready } = useRequestDraft();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting || !ready) return;
    if (!user) {
      Alert.alert("Not signed in", "Please sign in and try again.");
      return;
    }
    if (!draft.category) {
      setSubmitError("Choose a service category before sending your request.");
      return;
    }
    if (draft.description.trim().length < 10) {
      setSubmitError("Please describe the job using at least 10 characters.");
      return;
    }
    if (!draft.urgency) {
      setSubmitError("Choose when you need the service.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const category = await findCategory(draft.category);
      const { data: requestId, error } = await supabase.rpc("create_service_request", {
        p_category_id: category.id,
        p_description: draft.description.trim(),
        p_latitude: draft.latitude,
        p_longitude: draft.longitude,
        p_address: draft.address || null,
        p_area_name: draft.areaName || null,
        p_county: draft.county || null,
        p_urgency: draft.urgency,
        p_client_request_id: submissionId,
      });

      if (error) throw error;
      if (!requestId) {
        throw new Error("We couldn't confirm that your request was saved. Retry safely.");
      }

      // Clear local draft only after the server confirms the request ID.
      reset();
      Alert.alert(
        "Request sent",
        "Your request has been saved. We'll look for nearby providers and notify you when someone responds.",
        [{ text: "OK", onPress: () => router.replace("/(customer)") }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      console.warn("Request submission failed; draft retained for retry", error);
      setSubmitError(
        /network|fetch|timeout|offline|connection|reach the service list/i.test(message)
          ? "Your internet connection seems unavailable or slow. Your request is saved on this phone. Check your connection and tap Retry; you won't create a duplicate."
          : message || "We couldn't confirm the request was sent. Your details are saved. Tap Retry to safely check again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const urgencyLabel =
    draft.urgency === "now" ? "Right now" : draft.urgency === "today" ? "Today" : "This week";

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.step}>Step 5 of 5</Text>
      <Text style={styles.title}>Review your request</Text>
      <Text style={styles.subtitle}>
        Make sure everything looks right before sending. Your draft is saved on this phone.
      </Text>

      {!ready ? (
        <View style={styles.notice}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.noticeText}>Restoring your saved request…</Text>
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Couldn't confirm submission</Text>
          <Text style={styles.errorText}>{submitError}</Text>
          <Text style={styles.errorHint}>Keep this screen open if possible. Retry uses the same request ID.</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>Category</Text>
        <Text style={styles.value}>{draft.category ?? "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.value}>{draft.description || "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Location</Text>
        <Text style={styles.value}>{[draft.areaName, draft.county].filter(Boolean).join(", ") || "—"}</Text>
        {draft.address ? <Text style={styles.locationDetail}>{draft.address}</Text> : null}
        {draft.latitude !== null && draft.longitude !== null ? (
          <Text style={styles.locationDetail}>Coordinates: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Urgency</Text>
        <Text style={styles.value}>{draft.urgency ? urgencyLabel : "—"}</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} disabled={submitting}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.next, (submitting || !ready) && styles.disabled]}
          onPress={() => void submit()}
          disabled={submitting || !ready}
          accessibilityRole="button"
          accessibilityLabel={submitError ? "Retry sending request" : "Send service request"}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.nextText}>{submitError ? "Retry" : "Send request"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: Colors.background, flexGrow: 1 },
  step: { fontSize: 13, fontWeight: "700", color: Colors.primary, letterSpacing: 0.5 },
  title: { marginTop: 10, fontSize: 26, fontWeight: "800", color: Colors.text },
  subtitle: { marginTop: 6, marginBottom: 20, fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: Colors.backgroundSecondary },
  noticeText: { color: Colors.textSecondary, fontSize: 14 },
  errorBox: { padding: 14, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger ?? Colors.border, backgroundColor: Colors.backgroundSecondary, gap: 5 },
  errorTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  errorText: { fontSize: 14, lineHeight: 20, color: Colors.text },
  errorHint: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
  row: { padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.backgroundSecondary },
  locationDetail: { marginTop: 5, color: Colors.textSecondary, fontSize: 13 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  value: { marginTop: 6, fontSize: 16, fontWeight: "600", color: Colors.text },
  footer: { flexDirection: "row", gap: 12, marginTop: "auto", paddingTop: 24 },
  back: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 14 },
  backText: { fontSize: 16, fontWeight: "700", color: Colors.text },
  next: { flex: 2, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary },
  nextText: { fontSize: 16, fontWeight: "700", color: Colors.textInverse },
  disabled: { opacity: 0.6 },
});
