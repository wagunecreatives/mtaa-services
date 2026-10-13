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

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import { supabase } from "../../lib/supabase";

export default function ConfirmationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, reset } = useRequestDraft();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      Alert.alert("Not signed in", "Please sign in and try again.");
      return;
    }

    try {
      setSubmitting(true);

      const categorySlug = draft.category;
      if (!categorySlug) {
        Alert.alert("Choose a service", "Select a category before sending your request.");
        return;
      }

      const { data: category, error: categoryError } = await supabase
        .from("service_categories")
        .select("id, name")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .single();

      if (categoryError || !category) {
        Alert.alert("Service unavailable", "That service category is not available right now.");
        return;
      }

      const { error } = await supabase.rpc("create_service_request", {
        p_category_id: category.id,
        p_description: draft.description.trim(),
        p_latitude: draft.latitude,
        p_longitude: draft.longitude,
        p_address: draft.address || null,
        p_area_name: draft.areaName || null,
        p_county: draft.county || null,
        p_urgency: draft.urgency,
      });

      if (error) {
        Alert.alert("Couldn't submit", error.message);
        return;
      }

      reset();

      Alert.alert(
        "Request sent",
        "We're finding providers near you. You'll be notified when someone accepts.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/(customer)"),
          },
        ]
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Something went wrong", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const urgencyLabel =
    draft.urgency === "now"
      ? "Right now"
      : draft.urgency === "today"
      ? "Today"
      : "This week";

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.step}>Step 5 of 5</Text>
      <Text style={styles.title}>Review your request</Text>
      <Text style={styles.subtitle}>
        Make sure everything looks right before sending.
      </Text>

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
        {draft.latitude !== null && draft.longitude !== null ? <Text style={styles.locationDetail}>Coordinates: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</Text> : null}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Urgency</Text>
        <Text style={styles.value}>
          {draft.urgency ? urgencyLabel : "—"}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          disabled={submitting}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.next, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.nextText}>Send request</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64,
    backgroundColor: Colors.background,
    flexGrow: 1,
  },
  step: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  row: {
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
  },
  locationDetail: { marginTop: 5, color: Colors.textSecondary, fontSize: 13 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  value: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
    paddingTop: 24,
  },
  back: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
  },
  backText: { fontSize: 16, fontWeight: "700", color: Colors.text },
  next: {
    flex: 2,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
});
