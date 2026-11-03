import { useRouter } from "expo-router";
import { GlassView } from "expo-glass-effect";
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

import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signOut, resendSignupConfirmation } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    canResend?: boolean;
  } | null>(null);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setNotice({
        title: "Missing information",
        message: "Please enter your email and password.",
      });
      return;
    }

    try {
      setLoading(true);
      setNotice(null);

      const { user, error } = await signIn(
        trimmedEmail,
        password
      );

      if (error) {
        if (
          error.code === "email_not_confirmed" ||
          /email not confirmed/i.test(error.message)
        ) {
          setNotice({
            title: "Verify your email",
            message: `This account has not been verified yet. Resend a confirmation link to ${trimmedEmail}.`,
            canResend: true,
          });
        } else {
          setNotice({ title: "Login failed", message: error.message });
        }
        return;
      }

      if (!user) {
        setNotice({
          title: "Login failed",
          message: "We couldn't sign you in. Please try again.",
        });
        return;
      }

      // Gate unverified emails
      if (!user.email_confirmed_at) {
        await signOut();

        setNotice({
          title: "Verify your email",
          message: `This account has not been verified yet. Resend a confirmation link to ${user.email ?? trimmedEmail}.`,
          canResend: true,
        });
        return;
      }

      // The root index will handle role-based navigation.
      router.replace("/");
    } catch (error) {
      console.error("Login error:", error);

      setNotice({
        title: "Couldn't reach the sign-in service",
        message:
          error instanceof Error
            ? error.message
            : "Please check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setNotice({
        title: "Enter your email",
        message: "Enter your email address above, then request another confirmation link.",
      });
      return;
    }

    try {
      setResending(true);
      const { error } = await resendSignupConfirmation(trimmedEmail);
      if (error) {
        setNotice({
          title: "Couldn't send the confirmation email",
          message: error.message,
          canResend: true,
        });
        return;
      }

      setNotice({
        title: "Confirmation email requested",
        message: `Check ${trimmedEmail} and its spam folder for the confirmation link.`,
      });
    } catch (error) {
      setNotice({
        title: "Couldn't send the confirmation email",
        message:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
        canResend: true,
      });
    } finally {
      setResending(false);
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.brand}>MTAA SERVICES</Text>

            <Text style={styles.title}>Welcome Back</Text>

            <Text style={styles.subtitle}>
              Login to find trusted local service providers near you.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !resending}
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={Colors.textLight}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !resending}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                style={styles.input}
              />
              <TouchableOpacity
                onPress={() => router.push("/(auth)/forgot-password")}
                disabled={loading || resending}
                style={styles.forgotPasswordButton}
                activeOpacity={0.7}
              >
                <Text style={styles.resendText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            {notice && (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{notice.title}</Text>
                <Text style={styles.noticeMessage}>{notice.message}</Text>
                {notice.canResend && (
                  <TouchableOpacity
                    onPress={handleResendConfirmation}
                    disabled={loading || resending}
                    style={styles.resendButton}
                  >
                    {resending ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : (
                      <Text style={styles.resendText}>Resend confirmation email</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading || resending}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.textInverse}
                />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Register */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerPrompt}>
              Don&apos;t have an account?
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/register")}
              disabled={loading || resending}
              activeOpacity={0.7}
            >
              <Text style={styles.registerLink}>Create an account</Text>
            </TouchableOpacity>
          </View>

          {/* Back */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={loading || resending}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>← Back</Text>
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

  header: {
    marginBottom: 36,
  },

  brand: {
    marginBottom: 24,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Colors.primary,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.text,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
  },

  form: {
    width: "100%",
  },

  field: {
    marginBottom: 18,
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

  button: {
    height: 56,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  notice: {
    padding: 14,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
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

  resendButton: {
    minHeight: 40,
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: 6,
  },

  forgotPasswordButton: {
    alignSelf: "flex-end",
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  resendText: {
    color: Colors.primary,
    fontWeight: "700",
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },

  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
    gap: 5,
  },

  registerPrompt: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  registerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
  },

  backButton: {
    alignItems: "center",
    marginTop: 28,
  },

  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});
