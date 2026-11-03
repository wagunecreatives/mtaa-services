import Ionicons from "@expo/vector-icons/Ionicons";
import { GlassView } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ComponentProps } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "shield-checkmark-outline",
    title: "Verified providers",
    text: "Providers are checked before they can take jobs on MTAA SERVICES.",
  },
  {
    icon: "pricetag-outline",
    title: "Quotes you can compare",
    text: "Describe the job once and receive responses from providers in your area.",
  },
  {
    icon: "chatbubbles-outline",
    title: "Chat and stay updated",
    text: "Message your provider and follow your request from one place.",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
          <View style={styles.circleLarge} />
          <View style={styles.circleSmall} />

          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons name="flash" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.brand}>MTAA SERVICES</Text>
          </View>

          <Text style={styles.headline} accessibilityRole="header">
            Trusted local help,{"\n"}
            <Text style={styles.headlineAccent}>right in your mtaa.</Text>
          </Text>

          <Text style={styles.subhead}>
            Tell us what needs fixing and get connected with verified service providers near you.
          </Text>
        </View>

        {/* Actions card, overlapping the hero */}
        <View style={styles.actions}>
          <GlassView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            glassEffectStyle="clear"
          />
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Get started and create an account"
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.primaryText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="I already have an account. Log in."
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.secondaryText}>I already have an account</Text>
          </TouchableOpacity>
        </View>

        {/* Why MTAA */}
        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={Colors.primary} />
              </View>
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Provider entry point */}
        <TouchableOpacity
          style={[styles.providerLink, { marginBottom: insets.bottom + 24 }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Offer your services as a provider"
          onPress={() => router.push("/(auth)/register")}
        >
          <Ionicons name="briefcase-outline" size={18} color={Colors.primary} />
          <Text style={styles.providerText}>Offer your services as a provider</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },

  hero: {
    paddingHorizontal: 24,
    paddingBottom: 64,
    overflow: "hidden",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: Colors.primary,
  },
  circleLarge: {
    position: "absolute",
    top: -70,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.primaryLight,
    opacity: 0.25,
  },
  circleSmall: {
    position: "absolute",
    bottom: -40,
    left: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.accent,
    opacity: 0.18,
  },

  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accent,
  },
  brand: { color: Colors.textInverse, fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },

  headline: { marginTop: 36, color: Colors.textInverse, fontSize: 34, lineHeight: 42, fontWeight: "900" },
  headlineAccent: { color: Colors.accentLight },
  subhead: { marginTop: 14, color: Colors.primarySoft, fontSize: 16, lineHeight: 24 },

  actions: {
    position: "relative",
    marginTop: -32,
    marginHorizontal: 24,
    padding: 16,
    gap: 12,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
    backgroundColor: "rgba(255, 255, 255, 0.76)",
    overflow: "hidden",
    ...Shadow.card,
  },
  primaryButton: {
    minHeight: 56,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
  },
  primaryText: { color: Colors.textInverse, fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  secondaryText: { color: Colors.primary, fontSize: 15, fontWeight: "800" },

  features: { marginTop: 28, paddingHorizontal: 24, gap: 18 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  featureBody: { flex: 1, gap: 2 },
  featureTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  featureText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },

  providerLink: {
    marginTop: 28,
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  providerText: { color: Colors.primary, fontSize: 15, fontWeight: "800" },
});