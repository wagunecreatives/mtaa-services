import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Colors } from "../../constants/Colors";
import { RouteMessage, RouteScaffold } from "../../components/RouteScaffold";
import { supabase } from "../../lib/supabase";

type FeaturedProvider = {
  provider_id: string;
  business_name: string;
  bio: string | null;
  rating_average: number;
  total_reviews: number;
  category: string;
  area_name: string;
};

const CACHE_KEY = "mtaa.featured-providers.v1";

export default function CustomerServicesScreen() {
  const [featured, setFeatured] = useState<FeaturedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showingCached, setShowingCached] = useState(false);

  const loadFeatured = useCallback(async () => {
    setErrorMessage(null);
    setLoading(true);
    setRefreshing(true);

    try {
      const { data, error } = await supabase.rpc("get_active_featured_providers", {
        p_category_id: null,
        p_area_name: null,
      });
      if (error) throw error;

      const rows = (data ?? []) as FeaturedProvider[];
      setFeatured(rows);
      setShowingCached(false);
      try {
        await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(rows));
      } catch {
        // The live result remains useful even if local caching is unavailable.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(
        /network|fetch|timeout|offline|connection/i.test(message)
          ? "Connection is weak or unavailable. Check your internet and retry."
          : "We couldn't refresh featured providers. Please retry."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(CACHE_KEY);
        if (raw && active) {
          const rows = JSON.parse(raw) as FeaturedProvider[];
          if (Array.isArray(rows)) {
            setFeatured(rows);
            setShowingCached(true);
            setLoading(false);
          }
        }
      } catch {
        // Continue to live fetch if the cache is missing or corrupt.
      }
      if (active) await loadFeatured();
    })();
    return () => { active = false; };
  }, [loadFeatured]);

  return (
    <RouteScaffold eyebrow="Customer" title="Find a service" description="Tell us what you need and we will help you find a nearby provider.">
      <RouteMessage>Choose a service category to start a request. Available categories are shown in the request flow.</RouteMessage>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/request/category")}>
        <Text style={styles.buttonText}>Browse services</Text>
      </TouchableOpacity>
      <Text style={styles.heading}>Featured providers</Text>

      {showingCached ? (
        <Text style={styles.cacheNote}>Showing saved results. They may be out of date until your connection returns.</Text>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => void loadFeatured()} disabled={refreshing}>
            <Text style={styles.retry}>{refreshing ? "Retrying…" : "Retry connection"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.muted}>Loading providers…</Text>
        </View>
      ) : null}

      {!loading && !errorMessage && !featured.length ? (
        <Text style={styles.muted}>No featured providers are available right now. You can still browse services and submit a request.</Text>
      ) : null}

      {featured.map((provider) => (
        <View key={`${provider.provider_id}-${provider.category}-${provider.area_name}`} style={styles.featured}>
          <Text style={styles.badge}>⭐ FEATURED</Text>
          <Text style={styles.provider}>{provider.business_name}</Text>
          <Text style={styles.muted}>{provider.category} · {provider.area_name}</Text>
          <Text style={styles.muted}>★ {provider.rating_average?.toFixed(1) ?? "New"} · {provider.total_reviews ?? 0} reviews</Text>
          {!!provider.bio && <Text style={styles.muted}>{provider.bio}</Text>}
          <TouchableOpacity onPress={() => router.push("/request/category")}>
            <Text style={styles.link}>Request a service</Text>
          </TouchableOpacity>
        </View>
      ))}
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary },
  buttonText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" },
  heading: { color: Colors.text, fontSize: 19, fontWeight: "800", marginTop: 14 },
  featured: { padding: 14, gap: 5, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.backgroundSecondary },
  badge: { color: Colors.warning, fontWeight: "900", fontSize: 12 },
  provider: { color: Colors.text, fontWeight: "800", fontSize: 16 },
  muted: { color: Colors.textSecondary, lineHeight: 20 },
  link: { color: Colors.primary, fontWeight: "800", paddingVertical: 5 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  cacheNote: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, paddingVertical: 6 },
  errorBox: { padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.error, borderRadius: 12, backgroundColor: Colors.backgroundSecondary, marginVertical: 8 },
  errorText: { color: Colors.text, lineHeight: 20 },
  retry: { color: Colors.primary, fontWeight: "800", paddingVertical: 4 },
});
