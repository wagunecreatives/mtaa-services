import { useRouter } from "expo-router";
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { useRequestDraft } from "../../contexts/RequestDraftContext";

export default function DetailsScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();

  const canContinue = draft.description.trim().length >= 10;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.step}>Step 2 of 5</Text>
      <Text style={styles.title}>Describe the job</Text>
      <Text style={styles.subtitle}>
        The more detail you give, the more accurate the quote.
      </Text>

      <TextInput
        value={draft.description}
        onChangeText={(v) => update({ description: v })}
        placeholder="e.g. Kitchen sink is leaking under the cabinet..."
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        style={styles.textarea}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.next,
            !canContinue && styles.nextDisabled,
          ]}
          disabled={!canContinue}
          onPress={() => router.push("/request/location")}
        >
          <Text style={styles.nextText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    marginBottom: 20,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  textarea: {
    minHeight: 160,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    color: Colors.text,
    fontSize: 15,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  back: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  next: {
    flex: 2,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  nextDisabled: { opacity: 0.5 },
  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
});