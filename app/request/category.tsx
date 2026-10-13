import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { useRequestDraft } from "../../contexts/RequestDraftContext";

const CATEGORIES = [
  { id: "plumbing", label: "Plumbing", icon: "🚰" },
  { id: "electrical", label: "Electrical", icon: "💡" },
  { id: "cleaning", label: "Cleaning", icon: "🧹" },
  { id: "carpentry", label: "Carpentry", icon: "🪚" },
  { id: "painting", label: "Painting", icon: "🎨" },
  { id: "moving", label: "Moving", icon: "📦" },
  { id: "appliance", label: "Appliance Repair", icon: "🔧" },
  { id: "other", label: "Other", icon: "🛠️" },
];

export default function CategoryScreen() {
  const router = useRouter();
  const { update } = useRequestDraft();

  const pick = (id: string) => {
    update({ category: id });
    router.push("/request/details");
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.step}>Step 1 of 5</Text>
      <Text style={styles.title}>What do you need help with?</Text>
      <Text style={styles.subtitle}>
        Pick the service that best fits your job.
      </Text>

      <View style={styles.grid}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => pick(c.id)}
          >
            <Text style={styles.cardIcon}>{c.icon}</Text>
            <Text style={styles.cardLabel}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64,
    backgroundColor: Colors.background,
    flexGrow: 1,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
  },
  cardIcon: { fontSize: 28, marginBottom: 8 },
  cardLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },
});