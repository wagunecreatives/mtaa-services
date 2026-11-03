import {
  ActivityIndicator,
  View,
} from "react-native";

import { Redirect } from "expo-router";

import { Colors } from "../constants/Colors";
import { useAuth } from "../contexts/AuthContext";

export default function Index() {
  const {
    session,
    user,
    profile,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />
      </View>
    );
  }

  if (!session) {
    return (
      <Redirect href="/(auth)/welcome" />
    );
  }

  if (!profile) {
    return (
      <Redirect href="/(auth)/welcome" />
    );
  }

  if (!profile.is_active) {
    return <Redirect href="/account-review" />;
  }

  if (
    (profile.role === "provider" || profile.account_type === "provider") &&
    !user?.email_confirmed_at
  ) {
    return <Redirect href="/(auth)/login" />;
  }

  if (
    profile.account_type !== "provider" &&
    profile.phone_verification_required &&
    !profile.phone_verified
  ) {
    return <Redirect href="/(auth)/verify-phone" />;
  }

  switch (profile.role) {
    case "provider":
      if (!profile.onboarding_completed) {
        return <Redirect href="/provider-onboarding" />;
      }
      return (
        <Redirect href="/(provider)" />
      );

    case "customer":
      if (profile.account_type === "provider") {
        if (!profile.onboarding_completed) {
          return <Redirect href="/provider-onboarding" />;
        }
        return <Redirect href="/(provider)" />;
      }
      return (
        <Redirect href="/(customer)" />
      );

    case "admin":
    case "super_admin":
      return (
        <Redirect href="/(admin)" />
      );

    default:
      return (
        <Redirect href="/(auth)/welcome" />
      );
  }
}

const styles = {
  loading: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.background,
  },
};