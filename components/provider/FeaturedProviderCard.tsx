import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import type { FeaturedProvider } from "../../lib/providers";
import { ProviderAvatar } from "./ProviderAvatar";
import { RatingBadge } from "./RatingBadge";
import { VerifiedBadge } from "./VerifiedBadge";

export const FEATURED_CARD_WIDTH = 288;

type Props = {
  provider: FeaturedProvider;
  onPress: () => void;
  width?: number;
};

/** Wide card for the horizontal "Featured providers" carousel. */
export function FeaturedProviderCard({ provider, onPress, width = FEATURED_CARD_WIDTH }: Props) {
  const reviews = provider.total_reviews ?? 0;
  const ratingText = provider.rating_average != null && reviews > 0
    ? `${provider.rating_average.toFixed(1)} stars, ${reviews} reviews`
    : "new provider";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${provider.business_name}, ${provider.category}, ${provider.area_name}, ${ratingText}. Request a service.`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.featuredPill}>
          <Ionicons name="sparkles" size={12} color={Colors.accentText} />
          <Text style={styles.featuredText}>Featured</Text>
        </View>
        <RatingBadge rating={provider.rating_average} reviews={provider.total_reviews} />
      </View>

      <View style={styles.identity}>
        <ProviderAvatar name={provider.business_name} photoUrl={provider.profile_image_url} size={60} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={2}>{provider.business_name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="construct-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.meta} numberOfLines={1}>{provider.category}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.meta} numberOfLines={1}>{provider.area_name}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.bio} numberOfLines={2}>
        {provider.bio?.trim() || "Trusted local provider ready to help with your request."}
      </Text>

      <View style={styles.footer}>
        <VerifiedBadge />
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Request</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.textInverse} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    minHeight: 210,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.card,
    ...Shadow.card,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  featuredPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentSoft,
  },
  featuredText: { color: Colors.accentText, fontSize: 12, fontWeight: "800" },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityText: { flex: 1, gap: 3 },
  name: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { flexShrink: 1, color: Colors.textSecondary, fontSize: 13 },
  bio: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  ctaText: { color: Colors.textInverse, fontSize: 14, fontWeight: "700" },
});