import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "../../constants/Colors";
import { BorderRadius } from "../../constants/Theme";

export default function RequestSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark" size={38} color={Colors.textInverse} />
      </View>
      <Text style={styles.title}>Request sent</Text>
      <Text style={styles.description}>
        Your request has been saved. We&apos;ll look for nearby providers and notify you when someone responds.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.replace({
          pathname: "/(customer)/requests",
          params: params.requestId ? { requestId: params.requestId } : {},
        })}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Track my request</Text>
        <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.replace("/(customer)")}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: Colors.background },
  iconCircle: { width: 76, height: 76, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.success },
  title: { color: Colors.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  description: { maxWidth: 360, color: Colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  primaryButton: { width: "100%", minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 12, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary },
  primaryButtonText: { color: Colors.textInverse, fontSize: 15, fontWeight: "800" },
  secondaryButton: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg },
  secondaryButtonText: { color: Colors.primary, fontSize: 15, fontWeight: "700" },
});
