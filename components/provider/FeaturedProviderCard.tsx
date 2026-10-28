import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import type { FeaturedProvider } from "../../lib/providers";
import { ProviderAvatar } from "./ProviderAvatar";
import { RatingBadge } from "./RatingBadge";
import { VerifiedBadge } from "./VerifiedBadge";

export const FEATURED_CARD_WIDTH = 288;

type Props = {
  provider: FeaturedProvider;
  onPress?: () => void;
  onViewProfile?: () => void;
  onRequestService?: () => void;
  width?: number;
  compact?: boolean;
};

/** Wide card for the horizontal "Featured providers" carousel. */
export function FeaturedProviderCard({
  provider,
  onPress,
  onViewProfile,
  onRequestService,
  width = FEATURED_CARD_WIDTH,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <View style={[styles.card, styles.compactCard, { width: "100%" }]}>
        <View style={styles.compactIdentity}>
          <ProviderAvatar name={provider.business_name} photoUrl={provider.profile_image_url} size={52} />
          <View style={styles.compactCopy}>
            <Text style={styles.name} numberOfLines={1}>{provider.business_name}</Text>
            {provider.email_verified ? <View style={styles.compactVerified}><VerifiedBadge /></View> : null}
            <Text style={styles.compactMeta} numberOfLines={1}>{provider.category}</Text>
          </View>
          <RatingBadge rating={provider.rating_average} reviews={provider.total_reviews} />
        </View>
        <View style={styles.compactLocation}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>{provider.area_name}</Text>
        </View>
        {provider.bio?.trim() ? <Text style={styles.compactBio} numberOfLines={1}>{provider.bio.trim()}</Text> : null}
        <View style={styles.actions}>
          {onViewProfile ? (
            <TouchableOpacity
              style={styles.profileButton}
              onPress={onViewProfile}
              accessibilityRole="button"
              accessibilityLabel={`View ${provider.business_name} profile`}
            >
              <Text style={styles.profileButtonText}>View profile</Text>
            </TouchableOpacity>
          ) : null}
          <Pressable
            onPress={onRequestService ?? onPress}
            accessibilityRole="button"
            accessibilityLabel={`Request service from ${provider.business_name}`}
            style={({ pressed }) => [styles.cta, styles.compactCta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Request service</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.textInverse} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.topRow}>
        <View style={styles.featuredPill}>
          <Ionicons name="sparkles" size={12} color={Colors.accentText} />
          <Text style={styles.featuredText}>{provider.is_test ? "Test featured" : "Featured"}</Text>
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
        {provider.bio?.trim() || "No provider description is available yet."}
      </Text>

      <View style={styles.footer}>
        {provider.email_verified ? <VerifiedBadge /> : null}
        <Text style={styles.area} numberOfLines={1}>{provider.area_name}</Text>
      </View>
      <View style={styles.actions}>
        {onViewProfile ? (
          <TouchableOpacity
            style={styles.profileButton}
            onPress={onViewProfile}
            accessibilityRole="button"
            accessibilityLabel={`View ${provider.business_name} profile`}
          >
            <Text style={styles.profileButtonText}>View profile</Text>
          </TouchableOpacity>
        ) : null}
        <Pressable
          onPress={onRequestService ?? onPress}
          accessibilityRole="button"
          accessibilityLabel={`Request service from ${provider.business_name}`}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>Request service</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    minHeight: 248,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.card,
    ...Shadow.card,
  },
  compactCard: { width: "100%", minHeight: 0, gap: 9, padding: 13, borderColor: "#E8EEF5", borderRadius: 17 },
  compactIdentity: { flexDirection: "row", alignItems: "center", gap: 10 },
  compactCopy: { flex: 1, gap: 3 },
  compactVerified: { alignSelf: "flex-start" },
  compactMeta: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  compactLocation: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 2 },
  compactBio: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  compactCta: { flex: 1, justifyContent: "center" },
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
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto" },
  area: { flex: 1, color: Colors.textSecondary, fontSize: 12, textAlign: "right" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileButton: { minHeight: 40, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, backgroundColor: Colors.card },
  profileButtonText: { color: Colors.primary, fontSize: 13, fontWeight: "700" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  ctaText: { color: Colors.textInverse, fontSize: 13, fontWeight: "700" },
});