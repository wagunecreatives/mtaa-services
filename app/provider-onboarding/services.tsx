import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { Action, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";
import { useProviderOnboarding } from "../../contexts/ProviderOnboardingContext";
import { supabase } from "../../lib/supabase";

type Category = { id: string; name: string; description: string | null };
export default function ProviderServicesScreen() {
  const router = useRouter();
  const { draft, update } = useProviderOnboarding();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchCategories = useCallback(
    async () => await supabase.from("service_categories").select("id,name,description").eq("is_active", true).order("sort_order"),
    []
  );
  useEffect(() => {
    let active = true;
    void fetchCategories()
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setCategories(data ?? []);
      })
      .catch((error) => {
        if (!active) return;
        setCategories([]);
        setLoadError(error instanceof Error ? error.message : "Check your connection and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fetchCategories]);
  const retryLoadingCategories = () => {
    setLoading(true);
    setLoadError(null);
    void fetchCategories()
      .then(({ data, error }) => {
        if (error) throw error;
        setCategories(data ?? []);
      })
      .catch((error) => {
        setCategories([]);
        setLoadError(error instanceof Error ? error.message : "Check your connection and try again.");
      })
      .finally(() => setLoading(false));
  };
  const toggle = (id: string) => update({ categoryIds: draft.categoryIds.includes(id) ? draft.categoryIds.filter((x) => x !== id) : [...draft.categoryIds, id] });
  return <OnboardingPage step="2 of 3 · Services" title="What services do you offer?" footer={<><Action label="Back" secondary onPress={() => router.back()} /><Action label="Continue" onPress={() => { if (!draft.categoryIds.length) { Alert.alert("Choose a service", "Select at least one service category."); return; } router.push("/provider-onboarding/areas"); }} /></>}>
    {loading ? <ActivityIndicator color={Colors.primary} /> : loadError ? <View><Text style={{ color: Colors.textSecondary, marginBottom: 10 }}>Services could not be loaded. Your selected details are saved; try again when connected.</Text><Action label="Retry loading services" secondary onPress={retryLoadingCategories} /></View> : categories.length ? categories.map((category) => {
      const selected = draft.categoryIds.includes(category.id);
      return <TouchableOpacity key={category.id} onPress={() => toggle(category.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: selected ? Colors.primary : Colors.border, backgroundColor: selected ? "#EFF6FF" : Colors.backgroundSecondary, borderRadius: 12, marginBottom: 10 }}><View style={{ width: 22, height: 22, borderWidth: 1, borderColor: selected ? Colors.primary : Colors.border, borderRadius: 6, backgroundColor: selected ? Colors.primary : "white", alignItems: "center", justifyContent: "center" }}>{selected && <Text style={{ color: "white", fontWeight: "800" }}>✓</Text>}</View><View style={{ flex: 1 }}><Text style={{ color: Colors.text, fontWeight: "700" }}>{category.name}</Text>{category.description ? <Text style={{ color: Colors.textSecondary, marginTop: 3 }}>{category.description}</Text> : null}</View></TouchableOpacity>;
    }) : <Text style={{ color: Colors.textSecondary }}>No active service categories are available yet.</Text>}
  </OnboardingPage>;
}
