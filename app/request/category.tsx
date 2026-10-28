import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { RequestProgress } from "../../components/RequestProgress";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; slug: string };

function iconForCategory(name: string): keyof typeof Ionicons.glyphMap {
  const value = name.toLowerCase();
  if (value.includes("electric")) return "flash-outline";
  if (value.includes("plumb") || value.includes("water")) return "water-outline";
  if (value.includes("clean")) return "sparkles-outline";
  if (value.includes("paint")) return "color-palette-outline";
  if (value.includes("carpent") || value.includes("wood")) return "hammer-outline";
  if (value.includes("move")) return "cube-outline";
  return "construct-outline";
}

export default function CategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; categorySlug?: string }>();
  const { draft, update } = useRequestDraft();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(draft.category ?? "");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCategories = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
      setErrorMessage(null);
    }
    try {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id,name,slug")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as Category[];
      setCategories(rows);
      const preselected = rows.find(
        (category) => category.id === params.categoryId || category.slug === params.categorySlug,
      );
      if (preselected) setSelectedSlug(preselected.slug);
    } catch (error) {
      console.warn("Could not load service categories", error);
      setErrorMessage("We couldn't load service categories. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [params.categoryId, params.categorySlug]);

  useEffect(() => {
    void Promise.resolve().then(() => loadCategories());
  }, [loadCategories]);

  const continueWithCategory = () => {
    const category = categories.find((item) => item.slug === selectedSlug);
    if (!category) return;
    update({ category: category.slug, categoryName: category.name });
    router.push("/request/details");
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <RequestProgress step={1} />
      <Text style={styles.title}>What do you need help with?</Text>
      <Text style={styles.subtitle}>Choose the service that best describes your request.</Text>

      {loading ? <ActivityIndicator color={Colors.primary} style={styles.loader} /> : null}
      {errorMessage ? (
        <View style={styles.messageBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => void loadCategories(true)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !errorMessage && !categories.length ? (
        <View style={styles.messageBox}>
          <Text style={styles.emptyText}>There are no active services available right now.</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {categories.map((category) => {
          const selected = selectedSlug === category.slug;
          const tint = ["#E4F0FF", "#DDF7F4", "#FFF1D8", "#F4E8FF", "#FFE7E7", "#E6F4E2"][categories.indexOf(category) % 6];
          const iconColor = ["#1976E8", "#159B95", "#E29B17", "#8F4CC6", "#D95D5D", "#5A9847"][categories.indexOf(category) % 6];
          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.card, { backgroundColor: tint }, selected && styles.cardSelected]}
              activeOpacity={0.8}
              onPress={() => setSelectedSlug(category.slug)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={category.name}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <Ionicons name={iconForCategory(category.name)} size={26} color={selected ? Colors.textInverse : iconColor} />
              </View>
              <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]} numberOfLines={2}>{category.name}</Text>
              {selected ? <Ionicons name="checkmark-circle" size={18} color={Colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.next, (!selectedSlug || loading) && styles.disabled]}
          disabled={!selectedSlug || loading}
          onPress={continueWithCategory}
        >
          <Text style={styles.nextText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 54, paddingBottom: 32, backgroundColor: "#F4F8FD", flexGrow: 1 },
  title: { marginTop: 17, fontSize: 23, fontWeight: "900", color: Colors.text },
  subtitle: { marginTop: 6, marginBottom: 18, fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  loader: { paddingVertical: 24 },
  messageBox: { gap: 10, padding: 14, borderRadius: 15, backgroundColor: "#FFFFFF" },
  errorText: { color: Colors.error, fontSize: 14, lineHeight: 20 },
  retryText: { color: Colors.primary, fontWeight: "800" },
  emptyText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  card: { width: "47%", minHeight: 116, alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderWidth: 1, borderColor: "#FFFFFF", borderRadius: 17 },
  cardSelected: { borderColor: "#087BFA", backgroundColor: "#E8F2FF" },
  iconWrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "rgba(255,255,255,0.8)" },
  iconWrapSelected: { backgroundColor: Colors.primary },
  cardLabel: { color: Colors.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  cardLabelSelected: { color: "#087BFA" },
  footer: { flexDirection: "row", gap: 10, marginTop: "auto", paddingTop: 24 },
  back: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: "#FFFFFF" },
  backText: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  next: { flex: 2, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: "#087BFA" },
  nextText: { color: Colors.textInverse, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
