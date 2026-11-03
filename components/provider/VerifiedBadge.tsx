import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";

export function VerifiedBadge() {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel="Email Verified"
      accessibilityHint="Confirms control of an email address only. MTAA SERVICES has not independently verified identity, qualifications, or business legitimacy."
    >
      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
      <Text style={styles.text}>Email Verified</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { color: Colors.successText, fontSize: 12, fontWeight: "700" },
});