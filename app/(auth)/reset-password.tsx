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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    success?: boolean;
  } | null>(null);

  const handleReset = async () => {
    if (password.length < 6) {
      setNotice({
        title: "Password is too short",
        message: "Your password must be at least 6 characters.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setNotice({
        title: "Passwords don't match",
        message: "Enter the same password in both fields.",
      });
      return;
    }

    try {
      setLoading(true);
      setNotice(null);
      const { error } = await updatePassword(password);

      if (error) {
        setNotice({
          title: "Couldn't update your password",
          message: error.message,
        });
        return;
      }

      setNotice({
        title: "Password updated",
        message: "Your password has been changed. You can now sign in with it.",
        success: true,
      });
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password update failed:", error);
      setNotice({
        title: "Couldn't update your password",
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
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subtitle}>
            Use at least 6 characters for your new password.
          </Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter a new password"
            placeholderTextColor={Colors.textLight}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            style={styles.input}
          />

          <Text style={[styles.label, styles.confirmLabel]}>
            Confirm new password
          </Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Enter the password again"
            placeholderTextColor={Colors.textLight}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleReset}
            style={styles.input}
          />

          {notice && (
            <View style={[styles.notice, notice.success && styles.successNotice]}>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeMessage}>{notice.message}</Text>
              {notice.success && (
                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/login")}
                  disabled={loading}
                  style={styles.loginButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loginText}>Go to login</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
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
  confirmLabel: {
    marginTop: 18,
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
  loginButton: {
    minHeight: 40,
    justifyContent: "center",
    marginTop: 6,
  },
  loginText: {
    color: Colors.primary,
    fontWeight: "700",
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
});
