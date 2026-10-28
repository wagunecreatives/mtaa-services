import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ProviderAvatar } from "../../components/provider/ProviderAvatar";
import { VerifiedBadge } from "../../components/provider/VerifiedBadge";
import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import { useAuth } from "../../contexts/AuthContext";

const providerActions = [
  {
    title: "Matched leads",
    description: "Review requests for your services and areas. Send a quote or decline.",
    icon: "flash-outline",
    route: "/(provider)/leads",
    tint: Colors.primarySoft,
  },
  {
    title: "My jobs",
    description: "Manage assigned work, contact customers, and update job status.",
    icon: "briefcase-outline",
    route: "/(provider)/jobs",
    tint: Colors.successSoft,
  },
  {
    title: "Business profile",
    description: "Edit your public profile, availability, and work gallery.",
    icon: "person-circle-outline",
    route: "/(provider)/profile",
    tint: Colors.accentSoft,
  },
  {
    title: "Plans & visibility",
    description: "Manage your free plan and test featured listings.",
    icon: "trending-up-outline",
    route: "/(provider)/monetization",
    tint: Colors.primarySoft,
  },
] as const;

export default function ProviderHome() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      Alert.alert("Could not sign out", error.message);
      return;
    }
    router.replace("/(auth)/welcome");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MTAA SERVICES · PROVIDER</Text>
          <Text style={styles.title}>Provider workspace</Text>
          <Text style={styles.subtitle}>Welcome, {profile?.full_name || "Provider"}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(provider)/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open provider profile"
        >
          <ProviderAvatar name={profile?.full_name || "Provider"} size={48} />
        </TouchableOpacity>
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={22} color={Colors.successText} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>Your provider account</Text>
          <Text style={styles.noticeText}>Matched requests, job actions, and customer contact are available from this workspace.</Text>
        </View>
      </View>

      {user?.email_confirmed_at ? (
        <View style={styles.emailVerification}>
          <VerifiedBadge />
          <Text style={styles.emailVerificationText}>
            This confirms your email address only; it does not verify your identity, qualifications, or business.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Manage your work</Text>
      <View style={styles.actions}>
        {providerActions.map((action) => (
          <TouchableOpacity
            key={action.title}
            style={styles.actionCard}
            onPress={() => router.push(action.route as never)}
            accessibilityRole="button"
            accessibilityLabel={action.title}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.tint }]}>
              <Ionicons name={action.icon} size={23} color={Colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionDescription}>{action.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.secondaryActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/notifications")}>
          <Ionicons name="notifications-outline" size={19} color={Colors.primary} />
          <Text style={styles.secondaryText}>Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/(provider)/settings")}>
          <Ionicons name="settings-outline" size={19} color={Colors.primary} />
          <Text style={styles.secondaryText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={() => void handleLogout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 58, paddingBottom: 32, gap: 20, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, gap: 6 },
  eyebrow: { color: Colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "800" },
  subtitle: { color: Colors.textSecondary, fontSize: 15 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 15, borderRadius: BorderRadius.lg, backgroundColor: Colors.successSoft },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { color: Colors.successText, fontSize: 15, fontWeight: "800" },
  noticeText: { color: Colors.text, fontSize: 13, lineHeight: 19 },
  emailVerification: { gap: 6, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  emailVerificationText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  sectionTitle: { marginBottom: -10, color: Colors.text, fontSize: 18, fontWeight: "800" },
  actions: { gap: 10 },
  actionCard: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 13, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg, backgroundColor: Colors.card, ...Shadow.card },
  actionIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.md },
  actionCopy: { flex: 1, gap: 4 },
  actionTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  actionDescription: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  secondaryActions: { flexDirection: "row", gap: 10 },
  secondaryButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  secondaryText: { color: Colors.primary, fontSize: 13, fontWeight: "700" },
  signOut: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  signOutText: { color: Colors.error, fontWeight: "700" },
});
