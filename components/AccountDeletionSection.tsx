import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { Colors } from "../constants/Colors";
import { getPublicAccountDeletionUrl } from "../lib/accountDeletion";
import { supabase } from "../lib/supabase";

type ErrorResponse = {
  error?: string;
};

async function getFunctionErrorMessage(error: {
  message: string;
  context?: unknown;
}) {
  if (error.context instanceof Response) {
    try {
      const body = await error.context.json() as ErrorResponse;
      if (typeof body.error === "string") return body.error;
    } catch {
      return error.message;
    }
  }
  return error.message;
}

export function AccountDeletionSection() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const openPublicRequestPage = async () => {
    try {
      await Linking.openURL(getPublicAccountDeletionUrl());
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open the account deletion page.");
    }
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("account-deletion", {
        body: { action: "delete" },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.deleted !== true) throw new Error("The server did not confirm account deletion.");

      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error("Your account was deleted, but this device could not clear its saved session. Please sign out and restart the app.");
      }
      router.replace("/(auth)/welcome");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Account deletion failed. Please try again or contact support.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete account</Text>
      <Text style={styles.description}>
        Permanently delete your account and associated personal data. We will retain only information required for legal obligations, active disputes, fraud prevention, or necessary transaction records.
      </Text>
      {!confirming ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.deleteButton}
          onPress={() => {
            setErrorMessage("");
            setConfirming(true);
          }}
        >
          <Text style={styles.deleteButtonText}>Continue to delete account</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.confirmation}>
          <Text style={styles.warning}>
            This action is permanent and cannot be undone. An account involved in an active dispute cannot be deleted until that dispute is resolved.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.deleteButton}
            onPress={deleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.deleteButtonText}>Permanently delete my account</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.cancelButton}
            onPress={() => setConfirming(false)}
            disabled={deleting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="link"
        style={styles.linkButton}
        onPress={openPublicRequestPage}
      >
        <Text style={styles.linkText}>Request deletion on the web</Text>
      </TouchableOpacity>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  description: { color: Colors.textSecondary, lineHeight: 21 },
  confirmation: { gap: 10 },
  warning: { color: Colors.text, lineHeight: 21 },
  deleteButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#B42318",
  },
  deleteButtonText: { color: Colors.textInverse, fontWeight: "800", textAlign: "center" },
  cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: Colors.textSecondary, fontWeight: "700" },
  linkButton: { minHeight: 44, justifyContent: "center" },
  linkText: { color: Colors.primary, fontWeight: "800" },
  error: { color: "#B42318", lineHeight: 20 },
});
