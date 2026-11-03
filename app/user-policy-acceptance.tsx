import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Redirect, router } from "expo-router";
import * as Linking from "expo-linking";

import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";
import { getUserPolicyUrl } from "../lib/userPolicy";

export default function UserPolicyAcceptanceScreen() {
  const {
    acceptCurrentUserPolicy,
    loading,
    signOut,
    user,
    userPolicyAccepted,
    userPolicyAcceptanceChecked,
  } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />;
  if (!loading && userPolicyAccepted) return <Redirect href="/" />;

  const openPolicy = async () => {
    try {
      await Linking.openURL(getUserPolicyUrl());
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open the user terms.");
    }
  };

  const continueToApp = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    setError("");
    try {
      await acceptCurrentUserPolicy();
      router.replace("/");
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not save your acceptance. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const leaveAccount = async () => {
    const { error: signOutError } = await signOut();
    if (signOutError) setError(signOutError.message);
    else router.replace("/(auth)/welcome");
  };

  return (
    <RouteScaffold
      eyebrow="Before you continue"
      title="Community terms"
      description="To use MTAA SERVICES, please review and accept the Terms of Use and User Policy. We require this before you create or share marketplace content."
    >
      {!userPolicyAcceptanceChecked ? (
        <ActivityIndicator color={Colors.primary} />
      ) : (
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Our community standards</Text>
          <Text style={styles.body}>
            Keep listings, requests, messages, reviews, and profile information truthful and relevant. Do not post unlawful, threatening, harassing, discriminatory, deceptive, or spam content, or share another person&apos;s private information without permission.
          </Text>
          <Text style={styles.body}>
            You can report accounts or content and block accounts in the app. We may review reports, remove content, restrict features, or suspend accounts when needed to protect users and enforce these rules.
          </Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={styles.link}
            accessibilityRole="link"
            onPress={() => void openPolicy()}
          >
            <Text style={styles.linkText}>Read the full Terms of Use and User Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted((value) => !value)}
          >
            <Text style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? "✓" : ""}
            </Text>
            <Text style={styles.acceptText}>
              I have read and agree to the Terms of Use and User Policy.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (!accepted || busy) && styles.buttonDisabled]}
            disabled={!accepted || busy}
            onPress={() => void continueToApp()}
          >
            {busy
              ? <ActivityIndicator color={Colors.textInverse} />
              : <Text style={styles.buttonText}>Accept and continue</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.leaveButton} onPress={() => void leaveAccount()} disabled={busy}>
            <Text style={styles.linkText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  body: { color: Colors.textSecondary, fontSize: 15, lineHeight: 23 },
  error: { color: "#B42318", lineHeight: 21 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: Colors.primary, fontWeight: "800", textAlign: "center" },
  acceptRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textInverse,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
  },
  checkboxChecked: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  acceptText: { flex: 1, color: Colors.text, lineHeight: 21 },
  button: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: Colors.textInverse, fontWeight: "800" },
  leaveButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
