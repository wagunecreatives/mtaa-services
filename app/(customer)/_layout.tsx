import { Stack } from "expo-router";

export default function CustomerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="services" />
    </Stack>
  );
}
