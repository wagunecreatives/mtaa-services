import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type Plan = {
  key: string;
  name: string;
  price: string;
  features: string[];
  comingSoon: boolean;
};

type Subscription = {
  id: string;
  plan_key: string;
  status: string;
  ends_at: string | null;
};

type Category = { id: string; name: string };
type ServiceArea = { area_name: string; county: string };
type FeaturedListing = {
  id: string;
  category_id: string;
  area_name: string;
  duration_days: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  is_test: boolean;
};
type FeaturedListingOptions = { categories: Category[]; areas: ServiceArea[] };

const plans: Plan[] = [
  { key: "free", name: "FREE", price: "Free", features: ["Basic profile", "Limited leads"], comingSoon: false },
  { key: "pro", name: "PRO", price: "KSh 299", features: ["More leads", "WhatsApp", "Reviews", "Verified badge"], comingSoon: true },
  { key: "business", name: "BUSINESS", price: "KSh 599", features: ["Priority placement", "Analytics", "More leads", "Featured profile"], comingSoon: true },
  { key: "premium", name: "PREMIUM", price: "KSh 999", features: ["Homepage placement", "Promotion", "Priority leads", "CRM features"], comingSoon: true },
];

export default function ProviderMonetizationScreen() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [featuredListings, setFeaturedListings] = useState<FeaturedListing[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [durationDays, setDurationDays] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadSubscriptions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [subscriptionResult, listingResult, optionsResult] = await Promise.all([
      supabase.from("provider_subscriptions").select("id,plan_key,status,ends_at").eq("provider_id", user.id).order("created_at", { ascending: false }),
      supabase.from("featured_listings").select("id,category_id,area_name,duration_days,status,starts_at,ends_at,is_test").eq("provider_id", user.id).order("created_at", { ascending: false }),
      supabase.rpc("get_provider_featured_listing_options"),
    ]);

    const queryError = subscriptionResult.error ?? listingResult.error ?? optionsResult.error;
    if (queryError) setError(queryError.message);
    else {
      const options = optionsResult.data as FeaturedListingOptions | null;
      setSubscriptions(subscriptionResult.data ?? []);
      setFeaturedListings(listingResult.data ?? []);
      setCategories(options?.categories ?? []);
      setAreas(options?.areas ?? []);
      if (options?.categories?.length) setCategoryId((current) => current || options.categories[0].id);
      if (options?.areas?.length) setAreaName((current) => current || options.areas[0].area_name);
      setError("");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(loadSubscriptions);
  }, [loadSubscriptions]);

  const startFreePlan = () => {
    if (busy) return;
    Alert.alert("Start free plan", "The free plan is available once per provider account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        onPress: () => {
          setBusy(true);
          setError("");
          void (async () => {
            try {
              const { error: rpcError } = await supabase.rpc("start_provider_free_trial");
              if (rpcError) throw new Error(rpcError.message);
              Alert.alert("Free plan activated", "Your free provider plan is now active.");
              await loadSubscriptions();
            } catch (actionError: unknown) {
              setError(actionError instanceof Error ? actionError.message : "Could not activate the free plan.");
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const createTestListing = () => {
    const duration = Number(durationDays);
    if (!categoryId || !areaName || !Number.isInteger(duration) || duration < 1 || duration > 365) {
      Alert.alert("Complete listing details", "Select a service and area, and choose a duration from 1 to 365 days.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        const { error: rpcError } = await supabase.rpc("create_test_featured_listing", {
          p_category_id: categoryId,
          p_area_name: areaName,
          p_duration_days: duration,
        });
        if (rpcError) throw new Error(rpcError.message);
        Alert.alert("Test listing created", "Your unpaid test listing will appear in the matching featured area.");
        await loadSubscriptions();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not create the test listing.");
      } finally {
        setBusy(false);
      }
    })();
  };

  return <RouteScaffold eyebrow="Provider" title="Plans" description="Choose the plan that fits your business. Paid plans are not available during testing.">
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Paid plans coming soon</Text>
      <Text style={styles.muted}>We are testing the marketplace before connecting payments. Prices are indicative and may change before launch. No payment is collected for these plans during testing.</Text>
    </View>
    {plans.map((plan) => <View key={plan.key} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{plan.name}</Text>
        <Text style={styles.price}>{plan.price}</Text>
      </View>
      {plan.features.map((feature) => <Text key={feature} style={styles.muted}>✓ {feature}</Text>)}
      {plan.comingSoon
        ? <View style={styles.comingSoon}><Text style={styles.comingSoonText}>Coming soon</Text></View>
        : <TouchableOpacity style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={startFreePlan}>
          <Text style={styles.buttonText}>{busy ? "Activating…" : "Start free plan"}</Text>
        </TouchableOpacity>}
    </View>)}
    <Text style={styles.section}>⭐ FEATURED · KSh 100/day</Text>
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Test listing · No payment</Text>
      <Text style={styles.muted}>Create a non-paid listing to test featured placement in its matching category and area. The KSh 100/day price is indicative only; no charge or payment record will be created.</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>Service category</Text>
      {categories.length
        ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
          {categories.map((category) => <TouchableOpacity key={category.id} style={[styles.choice, categoryId === category.id && styles.choiceActive]} onPress={() => setCategoryId(category.id)}>
            <Text style={[styles.choiceText, categoryId === category.id && styles.choiceTextActive]}>{category.name}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        : <Text style={styles.muted}>Add an active service to your provider profile before creating a listing.</Text>}
      <Text style={styles.fieldLabel}>Service area</Text>
      {areas.length
        ? <View style={styles.choices}>
          {areas.map((area) => <TouchableOpacity key={`${area.county}:${area.area_name}`} style={[styles.choice, areaName === area.area_name && styles.choiceActive]} onPress={() => setAreaName(area.area_name)}>
            <Text style={[styles.choiceText, areaName === area.area_name && styles.choiceTextActive]}>{area.area_name} · {area.county}</Text>
          </TouchableOpacity>)}
        </View>
        : <Text style={styles.muted}>Add a service area to your provider profile before creating a listing.</Text>}
      <Text style={styles.fieldLabel}>Duration (days)</Text>
      <TextInput value={durationDays} onChangeText={setDurationDays} keyboardType="number-pad" maxLength={3} style={styles.input} accessibilityLabel="Featured listing duration in days" />
      <Text style={styles.muted}>Listing dates start when created and expire automatically. Test listings are clearly identified in discovery.</Text>
      <TouchableOpacity style={[styles.button, (busy || !categories.length || !areas.length) && styles.disabled]} disabled={busy || !categories.length || !areas.length} onPress={createTestListing}>
        <Text style={styles.buttonText}>{busy ? "Creating…" : "Create test featured listing"}</Text>
      </TouchableOpacity>
    </View>
    {!!featuredListings.length && <>
      <Text style={styles.section}>Your featured listings</Text>
      {featuredListings.map((listing) => {
        const category = categories.find((item) => item.id === listing.category_id)?.name ?? "Service";
        return <View key={listing.id} style={styles.listingCard}>
          <Text style={styles.title}>⭐ {category} · {listing.area_name}</Text>
          <Text style={styles.muted}>{listing.is_test ? "Test listing · No payment" : "Paid listing"}</Text>
          <Text style={styles.muted}>{listing.status.replaceAll("_", " ")} · {listing.duration_days} days</Text>
          <Text style={styles.muted}>Starts {listing.starts_at ? new Date(listing.starts_at).toLocaleDateString() : "not set"} · Ends {listing.ends_at ? new Date(listing.ends_at).toLocaleDateString() : "not set"}</Text>
        </View>;
      })}
    </>}
    {!!subscriptions.length && <>
      <Text style={styles.section}>Subscription history</Text>
      {subscriptions.map((item) => <Text key={item.id} style={styles.muted}>
        {item.plan_key.toUpperCase()} · {item.status.replaceAll("_", " ")} · ends {item.ends_at ? new Date(item.ends_at).toLocaleDateString() : "not set"}
      </Text>)}
    </>}
  </RouteScaffold>;
}

const styles = StyleSheet.create({
  section: { color: Colors.text, fontSize: 18, fontWeight: "800", marginTop: 8 },
  card: { padding: 16, gap: 10, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { color: Colors.text, fontWeight: "800", fontSize: 16 },
  price: { color: Colors.primary, fontWeight: "900" },
  muted: { color: Colors.textSecondary, lineHeight: 20 },
  notice: { padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.backgroundSecondary },
  noticeTitle: { color: Colors.primary, fontWeight: "900", fontSize: 16 },
  fieldLabel: { color: Colors.text, fontWeight: "700" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: Colors.border },
  choiceActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceText: { color: Colors.textSecondary },
  choiceTextActive: { color: "#fff" },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  listingCard: { padding: 14, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary },
  comingSoon: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: Colors.border },
  comingSoonText: { color: Colors.textSecondary, fontWeight: "800" },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: Colors.primary },
  buttonText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.55 },
  error: { color: Colors.error },
});
