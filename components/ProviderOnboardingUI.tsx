import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Colors } from "../constants/Colors";

export function OnboardingPage({ step, title, children, footer }: { step: string; title: string; children: ReactNode; footer: ReactNode }) {
  return <View style={styles.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><Text style={styles.step}>{step}</Text><Text style={styles.title}>{title}</Text>{children}</ScrollView><View style={styles.footer}>{footer}</View></View>;
}
export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: "default" | "phone-pad" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textLight} multiline={multiline} keyboardType={keyboardType} style={[styles.input, multiline && styles.multiline]} /></View>;
}
export function Action({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.secondary, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></TouchableOpacity>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: Colors.background }, content: { padding: 24, paddingTop: 62, paddingBottom: 30 }, step: { color: Colors.primary, fontWeight: "700" }, title: { color: Colors.text, fontSize: 27, fontWeight: "800", marginTop: 10, marginBottom: 22 }, field: { marginBottom: 16 }, label: { color: Colors.text, fontWeight: "700", marginBottom: 7 }, input: { minHeight: 50, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, color: Colors.text, backgroundColor: Colors.backgroundSecondary }, multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" }, footer: { flexDirection: "row", gap: 10, padding: 20, borderTopWidth: 1, borderColor: Colors.border }, button: { flex: 1, minHeight: 50, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, secondary: { backgroundColor: Colors.backgroundSecondary, borderWidth: 1, borderColor: Colors.border }, buttonText: { color: Colors.textInverse, fontWeight: "700" }, secondaryText: { color: Colors.text } });
