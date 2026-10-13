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
    return (
      <Redirect href="/(auth)/welcome" />
    );
  }

  switch (profile.role) {
    case "customer":
      return (
        <Redirect href="/(customer)" />
      );

    case "provider":
      return (
        <Redirect href="/(provider)" />
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