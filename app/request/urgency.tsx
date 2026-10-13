import { useRouter } from "expo-router";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import {
    useRequestDraft,
    type Urgency,
} from "../../contexts/RequestDraftContext";

const OPTIONS: { id: Urgency; label: string; hint: string }[] = [
  {
    id: "now",
    label: "Right now",
    hint: "Emergency — within the hour",
  },
  {
    id: "today",
    label: "Today",
    hint: "Sometime before the end of day",
  },
  {
    id: "this_week",
    label: "This week",
    hint: "Flexible timing",
  },
];

export default function UrgencyScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();

  const pick = (id: Urgency) => {
    update({ urgency: id });
    router.push("/request/confirmation");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step 4 of 5</Text>
      <Text style={styles.title}>How urgent is it?</Text>
      <Text style={styles.subtitle}>
        Urgent jobs may cost a bit more.
      </Text>

      {OPTIONS.map((o) => {
        const selected = draft.urgency === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            style={[
              styles.option,
              selected && styles.optionSelected,
            ]}
            onPress={() => pick(o.id)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.optionLabel,
                selected && styles.optionLabelSelected,
              ]}
            >
              {o.label}
            </Text>
            <Text style={styles.optionHint}>{o.hint}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.back}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 64,
    backgroundColor: Colors.background,
  },
  step: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  option: {
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#EFF6FF",
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  optionLabelSelected: { color: Colors.primary },
  optionHint: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  back: {
    marginTop: 24,
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});