import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteScaffold } from "../../components/RouteScaffold";
import { FEATURED_CARD_WIDTH, FeaturedProviderCard } from "../../components/provider/FeaturedProviderCard";
import { SectionHeader } from "../../components/provider/SectionHeader";
import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import type { FeaturedProvider } from "../../lib/providers";
import { supabase } from "../../lib/supabase";

const CACHE_KEY = "mtaa.featured-providers.v1";
const CARD_GAP = 12;

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
      <TouchableOpacity
        style={styles.browseCard}
        activeOpacity={0.85}
        onPress={() => router.push("/request/category")}
        accessibilityRole="button"
        accessibilityLabel="Browse services and start a request"
      >
        <View style={styles.browseIcon}>
          <Ionicons name="construct" size={24} color={Colors.textInverse} />
        </View>
        <View style={styles.browseText}>
          <Text style={styles.browseTitle}>Browse services</Text>
          <Text style={styles.browseSubtitle}>Plumbing, electrical, cleaning and more</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
      </TouchableOpacity>

      <SectionHeader title="Featured providers" />

      {showingCached ? (
        <View style={styles.noticeBox}>
          <Ionicons name="cloud-offline-outline" size={18} color={Colors.accentText} />
          <Text style={styles.noticeText}>Showing saved results. They may be out of date until your connection returns.</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void loadFeatured()}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Retry connection"
          >
            <Ionicons name="refresh" size={16} color={Colors.primary} />
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
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={28} color={Colors.textLight} />
          <Text style={styles.emptyText}>No featured providers are available right now. You can still browse services and submit a request.</Text>
        </View>
      ) : null}

      {featured.length ? (
        <FlatList
          horizontal
          data={featured}
          keyExtractor={(provider) => `${provider.provider_id}-${provider.category}-${provider.area_name}`}
          renderItem={({ item }) => (
            <FeaturedProviderCard provider={item} onPress={() => router.push("/request/category")} />
          )}
          showsHorizontalScrollIndicator={false}
          snapToInterval={FEATURED_CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
        />
      ) : null}
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  browseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
    padding: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.primarySoft,
    ...Shadow.card,
  },
  browseIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary },
  browseText: { flex: 1, gap: 2 },
  browseTitle: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  browseSubtitle: { color: Colors.textSecondary, fontSize: 13 },
  muted: { flex: 1, color: Colors.textSecondary, lineHeight: 20 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  noticeBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.accentSoft },
  noticeText: { flex: 1, color: Colors.accentText, fontSize: 13, lineHeight: 18 },
  errorBox: { padding: 12, gap: 8, borderRadius: BorderRadius.md, backgroundColor: Colors.errorSoft },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { flex: 1, color: Colors.text, lineHeight: 20 },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" },
  retry: { color: Colors.primary, fontWeight: "800" },
  emptyText: { color: Colors.textSecondary, lineHeight: 20, textAlign: "center" },
  emptyBox: { alignItems: "center", gap: 8, padding: 20, borderRadius: BorderRadius.lg, backgroundColor: Colors.backgroundSecondary },
  // Bleed the carousel to the screen edges (RouteScaffold pads its content by 24).
  carousel: { marginHorizontal: -24 },
  carouselContent: { paddingHorizontal: 24, paddingVertical: 8, gap: CARD_GAP },
});