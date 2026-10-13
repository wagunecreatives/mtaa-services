import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function CustomerHome() {
  const router = useRouter();

  const { profile, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.replace("/(auth)/welcome");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        MTAA SERVICES
      </Text>

      <Text style={styles.subtitle}>
        Hello, {profile?.full_name || "Customer"}
      </Text>

      <Text style={styles.description}>
        Need something fixed? Find someone nearby.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() =>
          router.push("/request")
        }
      >
        <Text style={styles.primaryButtonText}>
          I NEED HELP NOW
        </Text>
      </TouchableOpacity>

      <View style={styles.quickLinks}>
        <TouchableOpacity onPress={() => router.push("/(customer)/services")}><Text style={styles.quickLink}>Services</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(customer)/requests")}><Text style={styles.quickLink}>Requests</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(customer)/messages")}><Text style={styles.quickLink}>Messages</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(customer)/profile")}><Text style={styles.quickLink}>Profile</Text></TouchableOpacity>
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
    fontSize: 30,
    fontWeight: "900",
    color: Colors.primary,
  },

  subtitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
  },

  description: {
    marginTop: 8,
    fontSize: 15,
    color: Colors.textSecondary,
  },

  primaryButton: {
    height: 58,
    marginTop: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },

  primaryButtonText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: "800",
  },

  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 22,
  },

  quickLink: {
    color: Colors.primary,
    fontWeight: "700",
    paddingVertical: 8,
  },

  logoutButton: {
    marginTop: 18,
    alignItems: "center",
  },

  logoutText: {
    color: Colors.error,
    fontWeight: "700",
  },
});
