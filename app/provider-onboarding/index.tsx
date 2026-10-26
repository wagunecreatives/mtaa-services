import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Action, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";

export default function ProviderOnboardingScreen() {
  const router = useRouter();
  return <OnboardingPage step="Provider setup" title="I want to offer services" footer={<Action label="Get started" onPress={() => router.push("/provider-onboarding/business")} />}><Text style={{ color: Colors.textSecondary, fontSize: 16, lineHeight: 24 }}>Create your business profile, choose your services, and tell customers which neighborhoods you cover. After your email is confirmed and setup is complete, your provider profile activates automatically. Your phone number is collected as contact information and is not verified yet.</Text></OnboardingPage>;
}
