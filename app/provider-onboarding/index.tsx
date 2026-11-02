import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { Action, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { useProviderOnboarding } from "../../contexts/ProviderOnboardingContext";

export default function ProviderOnboardingScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { draft } = useProviderOnboarding();
  const [loggingOut, setLoggingOut] = useState(false);
  const hasProgress = Boolean(
    draft.businessName ||
      draft.ownerName ||
      draft.categoryIds.length ||
      draft.areas.length
  );
  const resumePath = draft.areas.length
    ? "/provider-onboarding/pending"
    : draft.categoryIds.length
    ? "/provider-onboarding/areas"
    : draft.businessName || draft.ownerName
    ? "/provider-onboarding/services"
    : "/provider-onboarding/business";
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        Alert.alert("Could not log out", error.message);
        return;
      }
      router.replace("/(auth)/welcome");
    } catch (error) {
      Alert.alert("Could not log out", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };
  return <OnboardingPage step="Provider setup" title="I want to offer services" footer={<><Action label={loggingOut ? "Logging out…" : "Log out"} secondary onPress={() => void logout()} disabled={loggingOut} /><Action label={hasProgress ? "Resume setup" : "Get started"} onPress={() => router.push(hasProgress ? resumePath : "/provider-onboarding/business")} disabled={loggingOut} /></>}><Text style={{ color: Colors.textSecondary, fontSize: 16, lineHeight: 24 }}>Create your business profile, choose your services, and tell customers which neighborhoods you cover. Your progress is saved on this device so you can return later. If you selected photos before restarting, you may need to choose them again. After your email is confirmed and setup is complete, your provider profile activates automatically. Your phone number is collected as contact information and is not verified yet.</Text></OnboardingPage>;
}
