import { StyleSheet, Text, View } from "react-native";

export default function VerifyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Account</Text>
      <Text>Verification Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
  },
});