import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";

export function VerifiedBadge() {
  return (
    <View style={styles.row} accessibilityLabel="Verified provider">
      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
      <Text style={styles.text}>Verified</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { color: Colors.successText, fontSize: 12, fontWeight: "700" },
});