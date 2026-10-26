import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { GlassView } from "expo-glass-effect";

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    success?: boolean;
  } | null>(null);

  const handleRequest = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setNotice({
        title: "Enter your email",
        message: "Enter the email address associated with your account.",
      });
      return;
    }

    try {
      setLoading(true);
      setNotice(null);
      const { error } = await requestPasswordReset(trimmedEmail);

      if (error) {
        setNotice({
          title: "Couldn't request a reset link",
          message: error.message,
        });
        return;
      }

      setNotice({
        title: "Check your email",
        message: `If an account exists for ${trimmedEmail}, we sent a password reset link. Check your inbox and spam folder.`,
        success: true,
      });
    } catch (error) {
      console.error("Password reset request failed:", error);
      setNotice({
        title: "Couldn't reach the reset service",
        message:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.backgroundOrbLarge} />
      <View style={styles.backgroundOrbSmall} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <GlassView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            glassEffectStyle="clear"
          />
          <Text style={styles.brand}>MTAA SERVICES</Text>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Enter your account email and we&apos;ll send you a secure reset link.
          </Text>

          <Text style={styles.label}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={Colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={handleRequest}
            style={styles.input}
          />

          {notice && (
            <View style={[styles.notice, notice.success && styles.successNotice]}>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeMessage}>{notice.message}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRequest}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/(auth)/login")}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#EEF4FF",
    overflow: "hidden",
  },
  backgroundOrbLarge: {
    position: "absolute",
    top: -92,
    right: -78,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(59, 130, 246, 0.16)",
  },
  backgroundOrbSmall: {
    position: "absolute",
    bottom: -72,
    left: -64,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(245, 158, 11, 0.13)",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  container: {
    position: "relative",
    alignSelf: "center",
    width: "100%",
    maxWidth: 500,
    paddingHorizontal: 24,
    paddingVertical: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  brand: {
    marginBottom: 24,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Colors.primary,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },
  input: {
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    color: Colors.text,
    fontSize: 16,
  },
  notice: {
    padding: 14,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
  },
  successNotice: {
    borderColor: Colors.primary,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  noticeMessage: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  button: {
    height: 56,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
  backButton: {
    alignItems: "center",
    marginTop: 24,
    minHeight: 44,
    justifyContent: "center",
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});
