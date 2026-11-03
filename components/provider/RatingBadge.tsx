import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";
import { BorderRadius } from "../../constants/Theme";

type Props = {
  rating: number | null | undefined;
  reviews: number | null | undefined;
};

/** Star + rating + review count. Shows "New" when the provider has no reviews yet. */
export function RatingBadge({ rating, reviews }: Props) {
  const count = reviews ?? 0;

  if (!count || rating == null) {
    return (
      <View style={styles.newPill} accessibilityLabel="New provider, no reviews yet">
        <Text style={styles.newText}>New</Text>
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={`${rating.toFixed(1)} stars, ${count} reviews`}>
      <Ionicons name="star" size={14} color={Colors.accent} />
      <Text style={styles.rating}>{rating.toFixed(1)}</Text>
      <Text style={styles.count}>({count})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rating: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  count: { color: Colors.textSecondary, fontSize: 12 },
  newPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primarySoft,
  },
  newText: { color: Colors.primary, fontSize: 12, fontWeight: "700" },
});