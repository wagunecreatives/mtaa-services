import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "../constants/Colors";
import { RouteScaffold, RouteMessage } from "./RouteScaffold";

export function OnboardingStep({
  step,
  title,
  description,
  previous,
  next,
  nextLabel = "Continue",
}: {
  step: string;
  title: string;
  description: string;
  previous?: string;
  next?: string;
  nextLabel?: string;
}) {
  return (
    <RouteScaffold eyebrow={`Provider setup · ${step}`} title={title} description={description}>
      <RouteMessage>Setup details are not saved yet because this project does not include a provider onboarding schema.</RouteMessage>
      <View style={styles.actions}>
        {previous ? <TouchableOpacity style={styles.secondary} onPress={() => router.push(previous as never)}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity> : null}
        {next ? <TouchableOpacity style={styles.primary} onPress={() => router.push(next as never)}><Text style={styles.primaryText}>{nextLabel}</Text></TouchableOpacity> : null}
      </View>
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 12 },
  secondary: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 14 },
  secondaryText: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  primary: { flex: 2, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary },
  primaryText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" },
});
