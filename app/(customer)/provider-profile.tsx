import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ProviderAvatar } from "../../components/provider/ProviderAvatar";
import { RatingBadge } from "../../components/provider/RatingBadge";
import { VerifiedBadge } from "../../components/provider/VerifiedBadge";
import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import { supabase } from "../../lib/supabase";

type ProviderDetails = {
  provider_id: string;
  business_name: string;
  bio: string | null;
  profile_image_url: string | null;
  rating_average: number | null;
  total_reviews: number | null;
  email_verified: boolean;
};

type PortfolioImage = {
  id: string;
  storage_path: string;
};

export default function CustomerProviderProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    providerId?: string;
    name?: string;
    bio?: string;
    photoUrl?: string;
    rating?: string;
    reviews?: string;
    category?: string;
    categoryId?: string;
    area?: string;
  }>();
  const [provider, setProvider] = useState<ProviderDetails | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(Boolean(params.providerId));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!params.providerId) return;
      setLoading(true);
      try {
        const { data, error: providerError } = await supabase.rpc("get_provider_public_profile", {
          p_provider_id: params.providerId,
        });
        if (providerError) throw providerError;
        const providerRow = (Array.isArray(data) ? data[0] : data) as ProviderDetails | null;
        if (!providerRow) throw new Error("This provider profile is not available.");

        const { data: images, error: imagesError } = await supabase
          .from("provider_portfolio_images")
          .select("id,storage_path")
          .eq("provider_id", params.providerId)
          .order("created_at", { ascending: false });
        if (imagesError) throw imagesError;
        if (!active) return;
        setProvider(providerRow);
        setPortfolio((images ?? []) as PortfolioImage[]);
        setError("");
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this provider profile.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfile();
    return () => {
      active = false;
    };
  }, [params.providerId]);

  const name = provider?.business_name || params.name || "Provider";
  const bio = provider?.bio || params.bio;
  const profileImage = provider?.profile_image_url || params.photoUrl || null;
  const rating = provider?.rating_average ?? (params.rating ? Number(params.rating) : null);
  const reviews = provider?.total_reviews ?? (params.reviews ? Number(params.reviews) : 0);
  const validRating = rating !== null && Number.isFinite(rating) ? rating : null;
  const validReviews = Number.isFinite(reviews) ? reviews : 0;
  const canDisplayProfile = !params.providerId || Boolean(provider);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.eyebrow}>Service provider</Text>
      </View>

      {loading ? <ActivityIndicator color={Colors.primary} style={styles.loading} /> : null}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {canDisplayProfile ? <>
      <View style={styles.profileCard}>
        <View style={styles.cover}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.coverImage} contentFit="cover" transition={180} accessibilityLabel={`${name} profile photo`} />
          ) : (
            <View style={styles.coverFallback}>
              <ProviderAvatar name={name} size={104} />
            </View>
          )}
        </View>
        <View style={styles.profileDetails}>
          <View style={styles.nameRow}>
            <View style={styles.nameColumn}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.category}>{params.category || "Service provider"}</Text>
            </View>
            <RatingBadge rating={validRating} reviews={validReviews} />
          </View>
          <View style={styles.metaRow}>
            {provider?.email_verified ? <VerifiedBadge /> : null}
            <Ionicons name="location-outline" size={17} color={Colors.primary} />
            <Text style={styles.metaText}>{params.area || "Service area not listed"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.bio}>{bio?.trim() || "This provider has not added a description yet."}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.galleryHeading}>
          <Text style={styles.sectionTitle}>Work gallery</Text>
          <Text style={styles.photoCount}>{portfolio.length} {portfolio.length === 1 ? "photo" : "photos"}</Text>
        </View>
        {portfolio.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {portfolio.map((image) => (
              <Image
                key={image.id}
                source={{ uri: supabase.storage.from("provider-assets").getPublicUrl(image.storage_path).data.publicUrl }}
                style={styles.galleryImage}
                contentFit="cover"
                transition={150}
                accessibilityLabel="Provider completed job"
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyGallery}>This provider has not added work photos yet.</Text>
        )}
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.noticeText}>
          Your request is matched with eligible available providers. You can review their replies and select the provider who is right for the job.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.requestButton, !params.categoryId && styles.requestButtonDisabled]}
        disabled={!params.categoryId}
        onPress={() => router.push({
          pathname: "/request/category",
          params: params.categoryId ? { categoryId: params.categoryId } : {},
        })}
        accessibilityRole="button"
        accessibilityLabel={`Request ${params.category || "this service"}`}
      >
        <Text style={styles.requestButtonText}>Request this service</Text>
        <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
      </TouchableOpacity>
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 16, padding: 18, paddingTop: 52, paddingBottom: 32, backgroundColor: Colors.background },
  topRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, backgroundColor: Colors.card },
  eyebrow: { color: Colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  loading: { marginVertical: 12 },
  error: { padding: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.errorSoft, color: Colors.error, fontSize: 13 },
  profileCard: { overflow: "hidden", borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.card, ...Shadow.card },
  cover: { height: 224, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: Colors.primarySoft },
  coverImage: { width: "100%", height: "100%" },
  coverFallback: { alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
  profileDetails: { gap: 12, padding: 16 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  nameColumn: { flex: 1, gap: 4 },
  name: { color: Colors.text, fontSize: 21, fontWeight: "800" },
  category: { color: Colors.primary, fontSize: 13, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  section: { gap: 10, padding: 16, borderRadius: BorderRadius.lg, backgroundColor: Colors.backgroundSecondary },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  bio: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  galleryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  photoCount: { color: Colors.textSecondary, fontSize: 12, fontWeight: "600" },
  gallery: { gap: 10 },
  galleryImage: { width: 132, height: 112, borderRadius: BorderRadius.md, backgroundColor: Colors.backgroundTertiary },
  emptyGallery: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: BorderRadius.lg, backgroundColor: Colors.primarySoft },
  noticeText: { flex: 1, color: Colors.text, fontSize: 13, lineHeight: 19 },
  requestButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary },
  requestButtonDisabled: { opacity: 0.55 },
  requestButtonText: { color: Colors.textInverse, fontSize: 15, fontWeight: "800" },
});
