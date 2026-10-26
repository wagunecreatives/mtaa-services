import Ionicons from "@expo/vector-icons/Ionicons";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FeaturedProviderCard } from "../../components/provider/FeaturedProviderCard";
import { SectionHeader } from "../../components/provider/SectionHeader";
import { Colors } from "../../constants/Colors";
import { Shadow, Spacing } from "../../constants/Theme";
import { useAuth } from "../../contexts/AuthContext";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import type { FeaturedProvider } from "../../lib/providers";
import { supabase } from "../../lib/supabase";

const AREA_KEY = "mtaa.customer-area.v1";
const CATEGORY_ICONS: readonly (keyof typeof Ionicons.glyphMap)[] = [
  "construct-outline",
  "flash-outline",
  "water-outline",
  "color-palette-outline",
  "sparkles-outline",
  "home-outline",
];
const CATEGORY_TINTS = [
  { background: "#DCEBFF", foreground: "#1479F8" },
  { background: "#DDF7F4", foreground: "#0C9D9A" },
  { background: "#FFF0D6", foreground: "#E69B11" },
  { background: "#F3E7FF", foreground: "#9348D8" },
  { background: "#FFE5E5", foreground: "#E65D5D" },
  { background: "#E4F4DF", foreground: "#5D9F48" },
] as const;

type Category = { id: string; name: string; slug: string };
type ServiceArea = { area_name: string; county: string };
type ActiveRequest = {
  id: string;
  title: string | null;
  area_name: string | null;
  status: string;
  created_at: string;
};
type ActiveJob = {
  id: string;
  request_id: string;
  status: string;
  agreed_price: number | null;
  created_at: string;
};
const ACTIVE_JOB_STATUSES = new Set([
  "assigned",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "awaiting_confirmation",
]);

function categoryIcon(name: string, index: number): keyof typeof Ionicons.glyphMap {
  const value = name.toLowerCase();
  if (value.includes("electric")) return "flash-outline";
  if (value.includes("plumb") || value.includes("water")) return "water-outline";
  if (value.includes("clean")) return "sparkles-outline";
  if (value.includes("paint")) return "color-palette-outline";
  if (value.includes("home") || value.includes("repair")) return "home-outline";
  return CATEGORY_ICONS[index % CATEGORY_ICONS.length];
}

export default function CustomerHome() {
  const { profile, user } = useAuth();
  const { update: updateRequestDraft } = useRequestDraft();
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [featured, setFeatured] = useState<FeaturedProvider[]>([]);
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);
  const [recentRequests, setRecentRequests] = useState<ActiveRequest[]>([]);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [selectedArea, setSelectedArea] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    try {
      const [categoryResult, areaResult, providerResult, requestResult, recentRequestResult, jobResult] = await Promise.all([
        supabase.from("service_categories").select("id,name,slug").eq("is_active", true).order("sort_order"),
        supabase.from("platform_service_areas").select("area_name,county").eq("is_active", true).order("sort_order"),
        supabase.rpc("get_active_featured_providers", { p_category_id: null, p_area_name: null }),
        user
          ? supabase.from("service_requests")
              .select("id,title,area_name,status,created_at")
              .eq("customer_id", user.id)
              .in("status", ["open", "matching", "responses_received", "provider_selected"])
              .order("created_at", { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [], error: null }),
        user
          ? supabase.from("service_requests")
              .select("id,title,area_name,status,created_at")
              .eq("customer_id", user.id)
              .order("created_at", { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [], error: null }),
        user
          ? supabase.from("jobs")
              .select("id,request_id,status,agreed_price,created_at")
              .eq("customer_id", user.id)
              .in("status", [...ACTIVE_JOB_STATUSES])
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
      ]);

      setCategories(categoryResult.data ?? []);
      setAreas(areaResult.data ?? []);
      setFeatured((providerResult.data ?? []) as FeaturedProvider[]);
      setActiveRequests((requestResult.data ?? []) as ActiveRequest[]);
      setRecentRequests((recentRequestResult.data ?? []) as ActiveRequest[]);
      setJobs((jobResult.data ?? []) as ActiveJob[]);

      const queryError = categoryResult.error ?? areaResult.error ?? providerResult.error ?? requestResult.error ?? recentRequestResult.error ?? jobResult.error;
      if (queryError) throw queryError;

      try {
        const savedArea = await SecureStore.getItemAsync(AREA_KEY);
        if (savedArea && (areaResult.data ?? []).some((area) => area.area_name === savedArea)) {
          setSelectedArea(savedArea);
        }
      } catch (error) {
        console.warn("Could not restore selected service area", error);
      }
    } catch (error) {
      console.warn("Could not load customer home data", error);
      setErrorMessage("We couldn't load the latest services. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(loadHome);
  }, [loadHome]);

  const retryHome = () => {
    setLoading(true);
    setErrorMessage(null);
    void loadHome();
  };

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? categories.filter((category) => category.name.toLowerCase().includes(query))
      : categories.slice(0, 8);
  }, [categories, search]);

  const visibleProviders = useMemo(
    () => selectedArea
      ? featured.filter((provider) => provider.area_name.toLowerCase() === selectedArea.toLowerCase())
      : featured,
    [featured, selectedArea],
  );
  const currentArea = areas.find((area) => area.area_name === selectedArea);
  const openRequests = activeRequests.filter((request) =>
    ["open", "matching", "responses_received", "provider_selected"].includes(request.status),
  );
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const initials = profile?.full_name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]?.toUpperCase()).join("") || "M";

  const chooseArea = (areaName: string) => {
    setSelectedArea(areaName);
    const selected = areas.find((area) => area.area_name === areaName);
    updateRequestDraft({
      areaName: selected?.area_name ?? "",
      county: selected?.county ?? "",
      address: selected ? `${selected.area_name}, ${selected.county}` : "",
    });
    void SecureStore.setItemAsync(AREA_KEY, areaName).catch((error) => {
      console.warn("Could not save selected service area", error);
    });
  };

  const cycleServiceArea = () => {
    if (!areas.length) return;
    const currentIndex = areas.findIndex((area) => area.area_name === selectedArea);
    const nextIndex = (currentIndex + 1) % areas.length;
    chooseArea(areas[nextIndex].area_name);
  };

  const openCategory = (slug: string) => {
    router.push({ pathname: "/request/category", params: { categorySlug: slug } });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.welcome}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.welcomeCopy}>
              <Text style={styles.eyebrow}>WELCOME BACK</Text>
              <Text style={styles.greeting}>{firstName}</Text>
              <View style={styles.locationInline}>
                <Ionicons name="location" size={13} color={Colors.primaryLight} />
                <Text style={styles.subheading} numberOfLines={1}>
                  {currentArea ? `${currentArea.area_name}, ${currentArea.county}` : "Choose your service area"}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push("/notifications")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={21} color={Colors.text} />
            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity onPress={retryHome} style={styles.retryButton}>
              <Text style={styles.link}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="What do you need fixed?"
              placeholderTextColor={Colors.textLight}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search service categories"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.areaFilter}
            onPress={cycleServiceArea}
            accessibilityRole="button"
            accessibilityLabel="Change service area"
          >
            <Ionicons name="options-outline" size={21} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.areaCard}>
          <View style={styles.areaLabelRow}>
            <Ionicons name="location-outline" size={16} color={Colors.primary} />
            <Text style={styles.areaLabel}>Service area</Text>
            <Text style={styles.currentAreaText} numberOfLines={1}>
              {currentArea ? `${currentArea.area_name}, ${currentArea.county}` : "Select your location"}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaChoices}>
            {areas.slice(0, 12).map((area) => {
              const selected = area.area_name === selectedArea;
              return (
                <TouchableOpacity
                  key={`${area.county}:${area.area_name}`}
                  style={[styles.areaChoice, selected && styles.areaChoiceSelected]}
                  onPress={() => chooseArea(selected ? "" : area.area_name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.areaChoiceText, selected && styles.areaChoiceTextSelected]}>{area.area_name}</Text>
                </TouchableOpacity>
              );
            })}
            {!areas.length && !loading ? <Text style={styles.helperText}>Service areas will appear here when available.</Text> : null}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={styles.heroBanner}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="I need help now. Start a service request."
          onPress={() => router.push("/request/category")}
        >
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>LOCAL HELP, MADE EASY</Text>
            <Text style={styles.heroTitle}>Need a hand at home?</Text>
            <Text style={styles.heroSubtitle}>Find a trusted professional for your next fix.</Text>
            <View style={styles.heroAction}>
              <Text style={styles.heroActionText}>I NEED HELP NOW</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </View>
          </View>
          <View style={styles.heroIllustration}>
            <Ionicons name="construct" size={42} color="#FFFFFF" />
            <View style={styles.heroSparkle}><Ionicons name="sparkles" size={17} color="#FFD36A" /></View>
          </View>
        </TouchableOpacity>

        <View style={styles.section}>
        <SectionHeader title="Service categories" actionLabel="See all" onAction={() => router.push("/(customer)/services")} />
        {loading && !categories.length ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : visibleCategories.length ? (
          <>
            <View style={styles.categoryGrid}>
              {visibleCategories.map((category, index) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryCard, { backgroundColor: CATEGORY_TINTS[index % CATEGORY_TINTS.length].background }]}
                  onPress={() => openCategory(category.slug)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Request ${category.name}`}
                >
                  <View style={styles.categoryIcon}>
                    <Ionicons name={categoryIcon(category.name, index)} size={25} color={CATEGORY_TINTS[index % CATEGORY_TINTS.length].foreground} />
                  </View>
                  <Text style={styles.categoryName} numberOfLines={2}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>
              {search ? "No categories match your search." : "No active service categories are available."}
            </Text>
            {!search ? <TouchableOpacity onPress={retryHome}><Text style={styles.link}>Try again</Text></TouchableOpacity> : null}
          </View>
        )}
        </View>

        <View style={styles.section}>
        <SectionHeader title="Popular near you" actionLabel="See all" onAction={() => router.push("/(customer)/services")} />
        {loading && !featured.length ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : visibleProviders.length ? (
          <View style={styles.providerList}>
            {visibleProviders.slice(0, 8).map((provider) => {
              const providerCategory = categories.find((category) => category.id === provider.category_id);
              return (
                <FeaturedProviderCard
                  key={`${provider.provider_id}-${provider.category}-${provider.area_name}`}
                  provider={provider}
                  compact
                  onViewProfile={() => router.push({
                    pathname: "/(customer)/provider-profile",
                    params: {
                      providerId: provider.provider_id,
                      name: provider.business_name,
                      bio: provider.bio ?? "",
                      photoUrl: provider.profile_image_url ?? "",
                      rating: provider.rating_average?.toString() ?? "",
                      reviews: provider.total_reviews?.toString() ?? "",
                      category: provider.category,
                      categoryId: provider.category_id ?? "",
                      area: provider.area_name,
                    },
                  })}
                  onRequestService={() => {
                    if (providerCategory) openCategory(providerCategory.slug);
                    else router.push("/request/category");
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>
              {selectedArea
                ? `No featured providers are listed in ${selectedArea} right now.`
                : "There are no featured providers available right now."}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(customer)/services")}>
              <Text style={styles.link}>Browse services</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>

        <View style={styles.section}>
        <SectionHeader title="Your active requests" />
        {loading && !activeRequests.length ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : openRequests.length ? (
          <View style={styles.requestList}>
            {openRequests.slice(0, 3).map((request) => (
              <TouchableOpacity
                key={request.id}
                style={styles.requestCard}
                onPress={() => router.push({
                  pathname: "/(customer)/requests",
                  params: { requestId: request.id },
                })}
                accessibilityRole="button"
                accessibilityLabel={`Track ${request.title || "service request"}, ${request.status}`}
              >
                <View style={styles.requestIcon}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestTitle} numberOfLines={1}>{request.title || "Service request"}</Text>
                  <Text style={styles.requestMeta} numberOfLines={1}>
                    {[request.area_name, request.status.replaceAll("_", " ")].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => router.push("/(customer)/requests")} style={styles.allRequestsButton}>
              <Text style={styles.link}>View all requests</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>You don&apos;t have any active requests yet.</Text>
            <TouchableOpacity onPress={() => router.push("/request/category")}>
              <Text style={styles.link}>Create your first request</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>

        <View style={styles.section}>
        <SectionHeader title="Active jobs" />
        {loading && !jobs.length ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : jobs.length ? (
          <View style={styles.requestList}>
            {jobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={styles.requestCard}
                onPress={() => router.push({
                  pathname: "/(customer)/requests",
                  params: { requestId: job.request_id },
                })}
                accessibilityRole="button"
                accessibilityLabel={`Track service job, ${job.status.replaceAll("_", " ")}`}
              >
                <View style={styles.requestIcon}>
                  <Ionicons name="construct-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestTitle}>Service job</Text>
                  <Text style={styles.requestMeta}>{job.status.replaceAll("_", " ")}</Text>
                </View>
                {job.agreed_price !== null ? (
                  <Text style={styles.jobPrice}>KES {job.agreed_price.toLocaleString()}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>No active jobs yet. Selected providers and accepted work will appear here.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent activity" />
        {loading && !activeRequests.length ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : recentRequests.length ? (
          <View style={styles.requestList}>
            {recentRequests.map((request) => (
              <TouchableOpacity
                key={request.id}
                style={styles.requestCard}
                onPress={() => router.push({
                  pathname: "/(customer)/requests",
                  params: { requestId: request.id },
                })}
                accessibilityRole="button"
              >
                <View style={styles.requestIcon}>
                  <Ionicons name="time-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestTitle} numberOfLines={1}>{request.title || "Service request"}</Text>
                  <Text style={styles.requestMeta}>
                    {request.status.replaceAll("_", " ")} · {new Date(request.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>Your recent requests and updates will appear here.</Text>
          </View>
        )}
        </View>
      </ScrollView>
      <View style={styles.bottomNav}>
        {([
          { label: "Home", icon: "home", route: "/(customer)" },
          { label: "Services", icon: "grid-outline", route: "/(customer)/services" },
          { label: "Requests", icon: "document-text-outline", route: "/(customer)/requests" },
          { label: "Profile", icon: "person-outline", route: "/(customer)/profile" },
        ] as const).map((item, index) => (
          <TouchableOpacity
            key={item.label}
            style={styles.navItem}
            onPress={() => router.push(item.route)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === 0 }}
          >
            <Ionicons name={item.icon} size={21} color={index === 0 ? Colors.primaryLight : Colors.textLight} />
            <Text style={[styles.navLabel, index === 0 && styles.navLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F8FD" },
  container: { paddingHorizontal: Spacing.md, paddingTop: 50, paddingBottom: 24, gap: 17 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  welcome: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#DCEBFF" },
  avatarText: { color: "#087BFA", fontSize: 16, fontWeight: "900" },
  welcomeCopy: { gap: 1 },
  eyebrow: { color: Colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  greeting: { color: Colors.text, fontSize: 21, fontWeight: "900" },
  locationInline: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: 240 },
  subheading: { color: Colors.textSecondary, fontSize: 12 },
  headerButton: { position: "relative", width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: Colors.card },
  notificationDot: { position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF7A59" },
  searchRow: { flexDirection: "row", gap: 9 },
  searchBox: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderRadius: 14, backgroundColor: Colors.card, ...Shadow.card },
  searchInput: { flex: 1, minHeight: 46, color: Colors.text, fontSize: 14 },
  areaFilter: { width: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.card, ...Shadow.card },
  areaCard: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderRadius: 14, backgroundColor: Colors.card },
  areaLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  areaLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  currentAreaText: { flex: 1, marginLeft: 3, color: Colors.text, fontSize: 12, fontWeight: "800" },
  areaChoices: { gap: 7, paddingTop: 9 },
  areaChoice: { minHeight: 30, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#F2F5F9" },
  areaChoiceSelected: { backgroundColor: "#087BFA" },
  areaChoiceText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  areaChoiceTextSelected: { color: "#FFFFFF" },
  heroBanner: { minHeight: 154, flexDirection: "row", alignItems: "center", overflow: "hidden", padding: 17, borderRadius: 20, backgroundColor: "#087BFA", ...Shadow.card },
  heroCopy: { flex: 1, alignItems: "flex-start", gap: 4, zIndex: 1 },
  heroEyebrow: { color: "#D6E9FF", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { marginTop: 2, color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  heroSubtitle: { maxWidth: 205, color: "#E6F1FF", fontSize: 12, lineHeight: 17 },
  heroAction: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 7, paddingHorizontal: 12, borderRadius: 18, backgroundColor: "#FFFFFF" },
  heroActionText: { color: "#087BFA", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  heroIllustration: { width: 78, height: 98, alignItems: "center", justifyContent: "center", marginLeft: 4, borderRadius: 38, backgroundColor: "rgba(255,255,255,0.16)", transform: [{ rotate: "-8deg" }] },
  heroSparkle: { position: "absolute", top: 9, right: 7 },
  section: { gap: 10 },
  loader: { paddingVertical: 20 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  categoryCard: { width: "31.5%", minHeight: 94, alignItems: "center", justifyContent: "center", gap: 7, padding: 9, borderRadius: 16, backgroundColor: Colors.card, ...Shadow.card },
  categoryIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.74)" },
  categoryName: { color: Colors.text, fontSize: 11, fontWeight: "800", textAlign: "center" },
  providerList: { gap: 10, paddingTop: 1 },
  messageCard: { gap: 8, padding: 14, borderRadius: 15, backgroundColor: Colors.card },
  helperText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  link: { color: "#087BFA", fontWeight: "800" },
  requestList: { gap: 8 },
  requestCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 11, padding: 10, borderRadius: 15, backgroundColor: Colors.card },
  requestIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#E6F1FF" },
  requestCopy: { flex: 1, gap: 3 },
  requestTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  jobPrice: { color: "#087BFA", fontSize: 11, fontWeight: "800" },
  requestMeta: { color: Colors.textSecondary, fontSize: 11, textTransform: "capitalize" },
  allRequestsButton: { minHeight: 38, justifyContent: "center", alignItems: "center" },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: 14, backgroundColor: Colors.errorSoft },
  errorText: { flex: 1, color: Colors.text, fontSize: 12 },
  retryButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 5 },
  bottomNav: { flexDirection: "row", justifyContent: "space-around", paddingTop: 9, paddingBottom: 19, borderTopWidth: 1, borderTopColor: "#EDF1F6", backgroundColor: Colors.card },
  navItem: { minWidth: 58, alignItems: "center", gap: 3 },
  navLabel: { color: Colors.textLight, fontSize: 10, fontWeight: "700" },
  navLabelActive: { color: "#087BFA" },
});
