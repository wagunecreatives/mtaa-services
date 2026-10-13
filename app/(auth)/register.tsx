import { useState } from "react";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { Colors } from "../../constants/Colors";
import {
  useAuth,
  type AccountType,
} from "../../contexts/AuthContext";

export default function RegisterScreen() {
  const router = useRouter();

  const { signUp } = useAuth();

  const [fullName, setFullName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [accountType, setAccountType] =
    useState<AccountType>("customer");

  const [loading, setLoading] =
    useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    kind: "success" | "error";
  } | null>(null);

  const handleRegister = async () => {
    if (
      !fullName.trim() ||
      !email.trim() ||
      !password
    ) {
      setNotice({
        title: "Missing information",
        message: "Please complete all fields.",
        kind: "error",
      });

      return;
    }

    if (password.length < 6) {
      setNotice({
        title: "Weak password",
        message: "Password must be at least 6 characters.",
        kind: "error",
      });

      return;
    }

    try {
      setLoading(true);
      setNotice(null);

      const { error } = await signUp(
        email.trim(),
        password,
        fullName.trim(),
        accountType
      );

      if (error) {
        const timedOut = error.status === 504 || /504|timed out|timeout/i.test(error.message);
        setNotice({
          title: timedOut ? "Signup timed out" : "Registration failed",
          message: timedOut
            ? "The server did not respond in time. Your account may still have been created, so check your inbox before trying again. If you can sign in but need verification, use the resend option on the login screen."
            : error.message,
          kind: "error",
        });

        return;
      }

      setNotice({
        title: "Account created",
        message: accountType === "provider"
          ? "Check your inbox for a confirmation email. Verify your address, then sign in to continue your provider application."
          : "Check your inbox for a confirmation email. Verify your address, then sign in to open your customer account.",
        kind: "success",
      });
    } catch (error) {
      console.error("Registration error:", error);
      setNotice({
        title: "Signup couldn't reach the server",
        message: error instanceof Error
          ? `${error.message} If this was a timeout, check your inbox before trying again.`
          : "Check your connection. If this was a timeout, check your inbox before trying again.",
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Create Account
      </Text>

      <Text style={styles.subtitle}>
        Join MTAA SERVICES
      </Text>

      {notice && (
        <View style={[styles.notice, notice.kind === "success" && styles.successNotice]}>
          <Text style={styles.noticeTitle}>{notice.title}</Text>
          <Text style={styles.noticeMessage}>{notice.message}</Text>
          {notice.kind === "success" && (
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.noticeAction}>Continue to Login</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TextInput
        value={fullName}
        onChangeText={setFullName}
        placeholder="Full name"
        placeholderTextColor={
          Colors.textLight
        }
        style={styles.input}
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        placeholderTextColor={
          Colors.textLight
        }
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={
          Colors.textLight
        }
        secureTextEntry
        style={styles.input}
      />

      <Text style={styles.sectionTitle}>
        What do you want to do?
      </Text>

      <TouchableOpacity
        style={[
          styles.option,
          accountType === "customer" &&
            styles.optionSelected,
        ]}
        onPress={() =>
          setAccountType("customer")
        }
      >
        <Text
          style={[
            styles.optionTitle,
            accountType === "customer" &&
              styles.optionTitleSelected,
          ]}
        >
          Find Services
        </Text>

        <Text style={styles.optionDescription}>
          I need trusted local service providers.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.option,
          accountType === "provider" &&
            styles.optionSelected,
        ]}
        onPress={() =>
          setAccountType("provider")
        }
      >
        <Text
          style={[
            styles.optionTitle,
            accountType === "provider" &&
              styles.optionTitleSelected,
          ]}
        >
          Offer Services
        </Text>

        <Text style={styles.optionDescription}>
          I provide services and want customers.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator
            color={Colors.textInverse}
          />
        ) : (
          <Text style={styles.buttonText}>
            Create Account
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() =>
          router.push("/(auth)/login")
        }
      >
        <Text style={styles.loginText}>
          Already have an account? Login
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: Colors.background,
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.text,
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    color: Colors.textSecondary,
  },

  notice: {
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#F2C7C2",
    borderRadius: 12,
    backgroundColor: "#FFF5F3",
  },

  successNotice: {
    borderColor: "#B8DDC4",
    backgroundColor: "#F1FAF4",
  },

  noticeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },

  noticeMessage: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },

  noticeAction: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
  },

  input: {
    height: 54,
    marginBottom: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor:
      Colors.backgroundSecondary,
    color: Colors.text,
  },

  sectionTitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },

  option: {
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },

  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#EFF6FF",
  },

  optionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },

  optionTitleSelected: {
    color: Colors.primary,
  },

  optionDescription: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  button: {
    height: 54,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },

  buttonText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
  },

  loginText: {
    marginTop: 20,
    textAlign: "center",
    color: Colors.primary,
    fontWeight: "600",
  },
});
