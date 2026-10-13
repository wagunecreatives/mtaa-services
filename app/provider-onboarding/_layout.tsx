import { Stack } from "expo-router";
import { ProviderOnboardingProvider } from "../../contexts/ProviderOnboardingContext";

export default function ProviderOnboardingLayout() {
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
