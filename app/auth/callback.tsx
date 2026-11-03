import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { Colors } from "../../constants/Colors";
import { supabase } from "../../lib/supabase";

export default function AuthCallbackScreen() {
  const url = Linking.useLinkingURL();
  const handledUrl = useRef<string | null>(null);
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;

    const finishAuthentication = async () => {
      try {
        const parsedUrl = new URL(url);
        const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
        const params = new URLSearchParams(parsedUrl.search);
        const code = params.get("code");
        const isPasswordRecovery =
          params.get("flow") === "recovery" ||
          params.get("type") === "recovery" ||
          hashParams.get("type") === "recovery";
        const accessToken = hashParams.get("access_token") ?? params.get("access_token");
        const refreshToken = hashParams.get("refresh_token") ?? params.get("refresh_token");
        const authError = hashParams.get("error_description") ?? params.get("error_description");

        if (authError) throw new Error(authError.replaceAll("+", " "));

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error("The confirmation link is incomplete or has expired.");
        }

        router.replace(
          isPasswordRecovery ? "/(auth)/reset-password" : "/"
        );
      } catch (error) {
        console.error("Email confirmation failed:", error);
        setMessage(error instanceof Error ? error.message : "Email confirmation failed. Please sign in and try again.");
      }
    };

    void finishAuthentication();
  }, [url]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: Colors.background },
  message: { color: Colors.text, fontSize: 16, lineHeight: 24, textAlign: "center" },
});
