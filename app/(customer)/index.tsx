import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import { useAuth } from "../../contexts/AuthContext";

type IconName = ComponentProps<typeof Ionicons>["name"];

const TILES = [
  { label: "Services", icon: "construct-outline", href: "/(customer)/services" },
  { label: "Requests", icon: "document-text-outline", href: "/(customer)/requests" },
  { label: "Messages", icon: "chatbubbles-outline", href: "/(customer)/messages" },
  { label: "Profile", icon: "person-outline", href: "/(customer)/profile" },
] as const satisfies readonly { label: string; icon: IconName; href: string }[];

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
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="I need help now. Start a service request."
        onPress={() =>
          router.push("/request")
        }
      >
        <Ionicons name="flash" size={22} color={Colors.accent} />
        <Text style={styles.primaryButtonText}>
          I NEED HELP NOW
        </Text>
      </TouchableOpacity>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.label}
            style={styles.tile}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={tile.label}
            onPress={() => router.push(tile.href)}
          >
            <View style={styles.tileIcon}>
              <Ionicons name={tile.icon} size={24} color={Colors.primary} />
            </View>
            <Text style={styles.tileLabel}>{tile.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        accessibilityRole="button"
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={18} color={Colors.error} />
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
    height: 64,
    marginTop: 32,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    ...Shadow.card,
  },

  primaryButtonText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: "800",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 22,
  },

  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.card,
    ...Shadow.card,
  },

  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },

  tileLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  logoutButton: {
    marginTop: 18,
    minHeight: 44,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  logoutText: {
    color: Colors.error,
    fontWeight: "700",
  },
});