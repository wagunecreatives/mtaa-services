import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { ProviderOnboardingProvider } from "../../contexts/ProviderOnboardingContext";

export default function ProviderOnboardingLayout() {
  const { user, profile, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: Colors.background }}><ActivityIndicator color={Colors.primary} /></View>;
  if (!profile) return <Redirect href="/(auth)/login" />;
  if (!profile.is_active) return <Redirect href="/account-review" />;
  if (profile.role !== "provider" && profile.account_type !== "provider") return <Redirect href="/" />;
  if (!user?.email_confirmed_at) return <Redirect href="/(auth)/login" />;
  return (
    <ProviderOnboardingProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="business" />
      <Stack.Screen name="services" />
      <Stack.Screen name="areas" />
      <Stack.Screen name="pending" />
    </Stack>
    </ProviderOnboardingProvider>
  );
}
