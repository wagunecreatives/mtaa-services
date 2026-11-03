import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import { ProviderAvatar } from "./ProviderAvatar";
import { RatingBadge } from "./RatingBadge";
import { VerifiedBadge } from "./VerifiedBadge";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type ResultChip = { icon: IconName; label: string };

type Props = {
  name: string;
  subtitle?: string | null;
  photoUrl?: string | null;
  rating?: number | null;
  reviews?: number | null;
  verified?: boolean;
  /** Short facts such as a quoted price, arrival time or distance. Only pass real data. */
  chips?: ResultChip[];
  onPress?: () => void;
  /** Replaces the default chevron (e.g. a status pill). */
  trailing?: ReactNode;
  accessibilityLabel?: string;
};

/** Compact row for lists: avatar, name, rating and a few real facts. */
export function ProviderResultCard({
  name, subtitle, photoUrl, rating, reviews, verified, chips, onPress, trailing, accessibilityLabel,
}: Props) {
  const content = (
    <>
      <ProviderAvatar name={name} photoUrl={photoUrl} size={48} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        <View style={styles.badges}>
          <RatingBadge rating={rating} reviews={reviews} />
          {verified ? <VerifiedBadge /> : null}
        </View>
        {chips?.length ? (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View key={`${chip.icon}-${chip.label}`} style={styles.chip}>
                <Ionicons name={chip.icon} size={12} color={Colors.primary} />
                <Text style={styles.chipText}>{chip.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={Colors.textLight} /> : null)}
    </>
  );

  if (!onPress) {
    return <View style={styles.card} accessibilityLabel={accessibilityLabel}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    padding: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.card,
    ...Shadow.card,
  },
  pressed: { opacity: 0.9 },
  body: { flex: 1, gap: 3 },
  name: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  subtitle: { color: Colors.textSecondary, fontSize: 13 },
  badges: { flexDirection: "row", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primarySoft,
  },
  chipText: { color: Colors.primary, fontSize: 12, fontWeight: "700" },
});