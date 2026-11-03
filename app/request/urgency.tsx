import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { RequestProgress } from "../../components/RequestProgress";
import { Colors } from "../../constants/Colors";
import { BorderRadius } from "../../constants/Theme";
import { useRequestDraft, type Urgency } from "../../contexts/RequestDraftContext";

const OPTIONS: { id: Urgency; label: string; hint: string }[] = [
  { id: "now", label: "Right now", hint: "As soon as a provider is available" },
  { id: "today", label: "Today", hint: "Before the end of today" },
  { id: "this_week", label: "This week", hint: "A flexible timeframe" },
];

export default function UrgencyScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();

  return (
    <View style={styles.container}>
      <RequestProgress step={4} />
      <Text style={styles.title}>When do you need help?</Text>
      <Text style={styles.subtitle}>Choose a timeframe so providers can respond appropriately.</Text>

      {OPTIONS.map((option) => {
        const selected = draft.urgency === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => update({ urgency: option.id })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={styles.optionCopy}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
              <Text style={styles.optionHint}>{option.hint}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.next, !draft.urgency && styles.nextDisabled]}
          disabled={!draft.urgency}
          onPress={() => router.push("/request/confirmation")}
        >
          <Text style={styles.nextText}>Review request</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 54, paddingBottom: 24, backgroundColor: "#F4F8FD" },
  title: { marginTop: 17, color: Colors.text, fontSize: 23, fontWeight: "900" },
  subtitle: { marginTop: 6, marginBottom: 18, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E8EEF5", borderRadius: 17, backgroundColor: "#FFFFFF" },
  optionSelected: { borderColor: "#087BFA", backgroundColor: "#EAF3FF" },
  optionCopy: { flex: 1, gap: 4 },
  optionLabel: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  optionLabelSelected: { color: "#087BFA" },
  optionHint: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  radio: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.border, borderRadius: BorderRadius.full },
  radioSelected: { borderColor: "#087BFA" },
  radioDot: { width: 10, height: 10, borderRadius: BorderRadius.full, backgroundColor: "#087BFA" },
  footer: { flexDirection: "row", gap: 10, marginTop: "auto", paddingTop: 20 },
  back: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DCE4EE", borderRadius: 14, backgroundColor: "#FFFFFF" },
  backText: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  next: { flex: 2, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#087BFA" },
  nextDisabled: { opacity: 0.5 },
  nextText: { color: Colors.textInverse, fontSize: 15, fontWeight: "800" },
});
