import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../constants/Colors";

export function RequestProgress({ step }: { step: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <View accessibilityLabel={`Step ${step} of 5`} style={styles.container}>
      <View style={styles.progressRow}>
        {Array.from({ length: 5 }, (_, index) => {
          const number = index + 1;
          const complete = number <= step;
          return (
            <View key={number} style={[styles.progressItem, number === 5 && styles.lastProgressItem]}>
              <View style={[styles.dot, complete && styles.dotActive]}>
                <Text style={[styles.number, complete && styles.numberActive]}>{number}</Text>
              </View>
              {number < 5 ? <View style={[styles.connector, number < step && styles.connectorActive]} /> : null}
            </View>
          );
        })}
      </View>
      <Text style={styles.label}>STEP {step} OF 5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  progressRow: { flexDirection: "row", alignItems: "center" },
  progressItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  lastProgressItem: { flex: 0 },
  dot: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D8E1ED", borderRadius: 12, backgroundColor: "#FFFFFF" },
  dotActive: { borderColor: "#087BFA", backgroundColor: "#087BFA" },
  number: { color: Colors.textLight, fontSize: 10, fontWeight: "800" },
  numberActive: { color: "#FFFFFF" },
  connector: { height: 2, flex: 1, marginHorizontal: 4, backgroundColor: "#D8E1ED" },
  connectorActive: { backgroundColor: "#087BFA" },
  label: { color: "#087BFA", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
});
