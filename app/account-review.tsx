import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import { Redirect, router } from "expo-router";
import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";
import { getAccountReviewRequest, submitAccountReviewRequest, type AccountReviewRequest } from "../lib/accountReview";

export default function AccountReviewScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [request, setRequest] = useState<AccountReviewRequest | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRequest(await getAccountReviewRequest());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your account review status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getAccountReviewRequest()
      .then((data) => {
        if (active) setRequest(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your account review status.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    if (reason.trim().length < 5) {
      Alert.alert("Add more detail", "Explain your request in at least five characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitAccountReviewRequest(reason);
      setReason("");
      await load();
      Alert.alert("Request submitted", "An administrator will review your account.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your account review request.");
    } finally {
      setBusy(false);
    }
  };

  const continueToAccount = async () => {
    await refreshProfile();
    router.replace("/");
  };

  const logout = async () => {
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    router.replace("/(auth)/welcome");
  };

  if (!profile && !loading) return <Redirect href="/(auth)/welcome" />;
  if (profile?.is_active) return <Redirect href="/" />;

  return (
    <RouteScaffold eyebrow="Account status" title="Account review required" description="Your account is deactivated. You can sign in, but access to the marketplace is paused while you request a review.">
      {loading ? <ActivityIndicator color={Colors.primary} /> : <>
        {request && <Text style={styles.status}>Request status: {request.status === "pending" ? "Awaiting review" : request.status === "approved" ? "Approved" : "Not approved"}</Text>}
        {!!request?.admin_notes && <Text style={styles.message}>Administrator note: {request.admin_notes}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {request?.status === "pending" && <Text style={styles.message}>Your request has been sent. Check back here for the decision.</Text>}
        {request?.status === "approved" && <TouchableOpacity disabled={busy} style={styles.button} onPress={() => void continueToAccount()}><Text style={styles.buttonText}>Continue to your account</Text></TouchableOpacity>}
        {(!request || request.status === "denied") && <>
          <Text style={styles.label}>{request ? "You may submit a new request with more information." : "Why should your account be reactivated?"}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            maxLength={3000}
            multiline
            textAlignVertical="top"
            placeholder="Explain what happened and why you are requesting a review."
            placeholderTextColor={Colors.textSecondary}
            style={styles.input}
            accessibilityLabel="Account review reason"
          />
          <TouchableOpacity disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void submit()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send review request</Text>}
          </TouchableOpacity>
        </>}
        <TouchableOpacity disabled={busy} style={styles.secondaryButton} onPress={() => void load()}><Text style={styles.secondaryText}>Check review status</Text></TouchableOpacity>
      </>}
      <TouchableOpacity disabled={busy} style={styles.secondaryButton} onPress={() => void logout()}><Text style={styles.secondaryText}>Sign out</Text></TouchableOpacity>
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  status: { color: Colors.primary, fontWeight: "800" },
  message: { color: Colors.textSecondary, lineHeight: 21 },
  label: { color: Colors.text, fontWeight: "700" },
  input: { minHeight: 140, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.primary },
  buttonText: { color: "#fff", fontWeight: "800" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: Colors.primary, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  error: { color: Colors.error },
});
