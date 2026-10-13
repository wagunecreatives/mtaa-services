import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { Colors } from "../../constants/Colors";

export default function AdminLayout() {
  const { profile, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: Colors.background }}><ActivityIndicator color={Colors.primary} /></View>;
  if (!profile || !["admin", "super_admin"].includes(profile.role) || !profile.is_active) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="jobs" />
      <Stack.Screen name="disputes" />
      <Stack.Screen name="platform" />
    </Stack>
  );
}
