import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function ProviderLayout() {
  const { user, profile, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: Colors.background }}><ActivityIndicator color={Colors.primary} /></View>;
  if (!profile?.is_active) return <Redirect href={profile ? "/account-review" : "/"} />;
  if (profile.role !== "provider" && profile.account_type !== "provider") return <Redirect href="/" />;
  if (!user?.email_confirmed_at) return <Redirect href="/(auth)/login" />;
  if (!profile.onboarding_completed) return <Redirect href="/provider-onboarding" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="jobs" />
      <Stack.Screen name="leads" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
