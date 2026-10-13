import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Colors } from "../constants/Colors";

export function RouteScaffold({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

export function RouteMessage({ children }: { children: ReactNode }) {
  return <Text style={styles.message}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, paddingTop: 64, backgroundColor: Colors.background },
  eyebrow: { color: Colors.primary, fontSize: 13, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { marginTop: 10, color: Colors.text, fontSize: 28, fontWeight: "800" },
  description: { marginTop: 8, color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  body: { marginTop: 24, gap: 12 },
  message: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
