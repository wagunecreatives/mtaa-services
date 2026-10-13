import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function ProviderHome() {
  const router = useRouter();

  const { profile, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.replace("/(auth)/welcome");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Provider Dashboard
      </Text>

      <Text style={styles.subtitle}>
        Welcome, {profile?.full_name || "Provider"}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Your Business
        </Text>

        <Text style={styles.cardText}>
          Your provider profile and service
          requests will appear here.
        </Text>
      </View>

      <View style={styles.quickLinks}>
        <TouchableOpacity onPress={() => router.push("/(provider)/jobs")}><Text style={styles.quickLink}>Jobs</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(provider)/leads")}><Text style={styles.quickLink}>Leads</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(provider)/profile")}><Text style={styles.quickLink}>Profile</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(provider)/settings")}><Text style={styles.quickLink}>Settings</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(provider)/monetization" as never)}><Text style={styles.quickLink}>Plans & featured listings</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/provider-onboarding")}><Text style={styles.quickLink}>Provider setup</Text></TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>
          Logout
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: Colors.background,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 18,
    color: Colors.textSecondary,
  },

  card: {
    marginTop: 30,
    padding: 20,
    borderRadius: 16,
    backgroundColor:
      Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },

  cardText: {
    marginTop: 8,
    lineHeight: 22,
    color: Colors.textSecondary,
  },

  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 22,
  },

  quickLink: {
    color: Colors.primary,
    fontWeight: "700",
    paddingVertical: 8,
  },

  logoutButton: {
    marginTop: 24,
    alignItems: "center",
  },

  logoutText: {
    color: Colors.error,
    fontWeight: "700",
  },
});
