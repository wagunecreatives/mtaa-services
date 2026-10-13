import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "../../constants/Colors";
import { RouteMessage, RouteScaffold } from "../../components/RouteScaffold";
import { supabase } from "../../lib/supabase";

type FeaturedProvider = { provider_id: string; business_name: string; bio: string | null; rating_average: number; total_reviews: number; category: string; area_name: string };

export default function CustomerServicesScreen() {
  const [featured, setFeatured] = useState<FeaturedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void supabase.rpc("get_active_featured_providers", { p_category_id: null, p_area_name: null }).then(({ data }) => {
      setFeatured((data ?? []) as FeaturedProvider[]); setLoading(false);
    });
  }, []);
  return (
    <RouteScaffold eyebrow="Customer" title="Find a service" description="Tell us what you need and we will help you find a nearby provider.">
      <RouteMessage>Choose a service category to start a request. Available categories are shown in the request flow.</RouteMessage>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/request/category")}><Text style={styles.buttonText}>Browse services</Text></TouchableOpacity>
      <Text style={styles.heading}>Featured providers</Text>
      {loading && <ActivityIndicator color={Colors.primary} />}
      {!loading && !featured.length && <Text style={styles.muted}>No featured providers in your area yet.</Text>}
      {featured.map((provider) => <View key={`${provider.provider_id}-${provider.category}-${provider.area_name}`} style={styles.featured}>
        <Text style={styles.badge}>⭐ FEATURED</Text><Text style={styles.provider}>{provider.business_name}</Text>
        <Text style={styles.muted}>{provider.category} · {provider.area_name}</Text>
        <Text style={styles.muted}>★ {provider.rating_average?.toFixed(1) ?? "New"} · {provider.total_reviews ?? 0} reviews</Text>
        {!!provider.bio && <Text style={styles.muted}>{provider.bio}</Text>}
        <TouchableOpacity onPress={() => router.push("/request/category")}><Text style={styles.link}>Request a service</Text></TouchableOpacity>
      </View>)}
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({ button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary }, buttonText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" }, heading: { color: Colors.text, fontSize: 19, fontWeight: "800", marginTop: 14 }, featured: { padding: 14, gap: 5, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.backgroundSecondary }, badge: { color: Colors.warning, fontWeight: "900", fontSize: 12 }, provider: { color: Colors.text, fontWeight: "800", fontSize: 16 }, muted: { color: Colors.textSecondary, lineHeight: 20 }, link: { color: Colors.primary, fontWeight: "800", paddingVertical: 5 } });
