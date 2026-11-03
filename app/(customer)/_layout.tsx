import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";

export default function CustomerLayout() {
  const { profile, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: Colors.background }}><ActivityIndicator color={Colors.primary} /></View>;
  if (!profile?.is_active) return <Redirect href={profile ? "/account-review" : "/"} />;
  if (profile.role === "provider" || profile.account_type === "provider") return <Redirect href="/" />;
  if (profile.phone_verification_required && !profile.phone_verified) return <Redirect href="/(auth)/verify-phone" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="provider-profile" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="services" />
    </Stack>
  );
}
