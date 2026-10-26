import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import { Redirect, router } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { normalizePhoneNumber } from "../../lib/phone";
import { supabase } from "../../lib/supabase";

export default function VerifyPhoneScreen() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [phone, setPhone] = useState(() => {
    const metadataPhone = user?.user_metadata.phone_verification_number;
    return typeof metadataPhone === "string" ? metadataPhone : user?.phone ?? "";
  });
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const sendCode = async () => {
    if (!user || busy) return;
    if (resendSeconds > 0) return;

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      setError("Enter a valid phone number in international format, for example +254712345678.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: normalizedPhone });
      if (updateError) throw updateError;
      setPhone(normalizedPhone);
      setCode("");
      setCodeSent(true);
      setResendSeconds(60);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send the SMS code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!user || busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the six-digit code sent to your phone.");
      return;
    }
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      setError("Enter a valid phone number in international format.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: code.trim(),
        type: "phone_change",
      });
      if (verifyError) throw verifyError;

      const { error: syncError } = await supabase.rpc("complete_phone_verification");
      if (syncError) throw syncError;

      await refreshProfile();
      router.replace("/");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify the code. Request a new code and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <RouteScaffold eyebrow="Phone verification" title="Verify your phone" description="Loading your account status."><ActivityIndicator color={Colors.primary} /></RouteScaffold>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (
    profile &&
    !profile.phone_verification_required &&
    (profile.role !== "provider" || profile.onboarding_completed)
  ) return <Redirect href="/" />;
  if (profile?.phone_verified) return <Redirect href="/" />;

  return (
    <RouteScaffold eyebrow="Phone verification" title="Verify your phone" description="We’ll send a one-time code by SMS. The code expires after five minutes.">
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Phone number</Text>
      <TextInput
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          setCodeSent(false);
          setCode("");
          setResendSeconds(0);
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+254712345678"
        placeholderTextColor={Colors.textSecondary}
        style={styles.input}
        accessibilityLabel="Phone number"
      />
      <TouchableOpacity disabled={busy || resendSeconds > 0} style={[styles.button, (busy || resendSeconds > 0) && styles.disabled]} onPress={() => void sendCode()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{codeSent ? resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code" : "Send verification code"}</Text>}
      </TouchableOpacity>
      {codeSent && <>
        <Text style={styles.message}>Enter the six-digit code sent to {normalizePhoneNumber(phone)}. If it expires, request another code.</Text>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="Six-digit code"
          placeholderTextColor={Colors.textSecondary}
          style={styles.input}
          accessibilityLabel="SMS verification code"
        />
        <TouchableOpacity disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void verifyCode()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify phone</Text>}
        </TouchableOpacity>
      </>}
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.text, fontWeight: "700" },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.primary },
  buttonText: { color: "#fff", fontWeight: "800" },
  message: { color: Colors.textSecondary, lineHeight: 21 },
  error: { color: Colors.error },
  disabled: { opacity: 0.55 },
});
