import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
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

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      Alert.alert(
        "Missing information",
        "Please complete all fields."
      );
      return;
    }

    if (trimmedName.length < 2) {
      Alert.alert(
        "Invalid name",
        "Please enter your full name."
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Weak password",
        "Password must be at least 6 characters."
      );
      return;
    }

    try {
      setLoading(true);

      const { error } = await signUp(
        trimmedEmail,
        password,
        trimmedName,
        "customer"
      );

      if (error) {
        Alert.alert(
          "Registration failed",
          error.message
        );
        return;
      }

      Alert.alert(
        "Account created",
        "Your MTAA SERVICES account has been created successfully.",
        [
          {
            text: "Continue to Login",
            onPress: () => {
              router.replace("/(auth)/login");
            },
          },
        ]
      );
    } catch (error) {
      console.error("Registration error:", error);

      Alert.alert(
        "Registration failed",
        "Something went wrong while creating your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.brand}>MTAA SERVICES</Text>

            <Text style={styles.title}>Create Account</Text>

            <Text style={styles.subtitle}>
              Join MTAA SERVICES and connect with trusted
              local service providers near you.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Full Name</Text>

              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            {/* Email */}
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
                editable={!loading}
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor={Colors.textLight}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                style={styles.input}
              />

              <Text style={styles.passwordHint}>
                Password must be at least 6 characters.
              </Text>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.textInverse}
                />
              ) : (
                <Text style={styles.buttonText}>
                  Create Account
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Login */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginPrompt}>
              Already have an account?
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/login")}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>

          {/* Back */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={loading}
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
    backgroundColor: Colors.background,
  },

  scrollContent: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: Colors.background,
  },

  header: {
    marginBottom: 32,
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

  passwordHint: {
    marginTop: 7,
    fontSize: 12,
    color: Colors.textLight,
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

  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },

  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
    gap: 5,
  },

  loginPrompt: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  loginLink: {
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
