import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Alert, Image, Text } from "react-native";
import { Action, Field, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { useProviderOnboarding } from "../../contexts/ProviderOnboardingContext";

export default function ProviderBusinessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, update } = useProviderOnboarding();
  const contactPhone = user?.phone
    || (typeof user?.user_metadata.phone_verification_number === "string"
      ? user.user_metadata.phone_verification_number
      : "");
  const chooseImage = async (field: "profilePhoto" | "businessLogo") => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) update({ [field]: result.assets[0].uri });
  };
  return <OnboardingPage step="1 of 3 · Business" title="Business information" footer={<><Action label="Back" secondary onPress={() => router.back()} /><Action label="Continue" onPress={() => {
    if (!draft.businessName.trim() || !draft.ownerName.trim() || !contactPhone.trim()) { Alert.alert("Missing details", "Add your business name, owner name, and registration phone number."); return; }
    router.push("/provider-onboarding/services");
  }} /></>}>
    <Field label="Business name" value={draft.businessName} onChangeText={(businessName) => update({ businessName })} placeholder="e.g. Ruiru Plumbing Pros" />
    <Field label="Owner name" value={draft.ownerName} onChangeText={(ownerName) => update({ ownerName })} placeholder="Your full name" />
    <Text style={{ color: Colors.textSecondary, marginBottom: 14 }}>Contact phone (not verified): {contactPhone || "No registration phone number found."}</Text>
    <Field label="WhatsApp (optional)" value={draft.whatsapp} onChangeText={(whatsapp) => update({ whatsapp })} placeholder="+254..." keyboardType="phone-pad" />
    <Field label="Business description" value={draft.description} onChangeText={(description) => update({ description })} placeholder="Describe your experience and services" multiline />
    <Action label={draft.profilePhoto ? "Change profile photo" : "Choose profile photo"} secondary onPress={() => void chooseImage("profilePhoto")} />
    {draft.profilePhoto ? <Image source={{ uri: draft.profilePhoto }} style={{ width: 84, height: 84, borderRadius: 42, marginTop: 10, marginBottom: 14 }} /> : null}
    <Text style={{ marginTop: 16, marginBottom: 10, fontWeight: "700" }}>Business logo</Text>
    <Action label={draft.businessLogo ? "Change business logo" : "Choose business logo"} secondary onPress={() => void chooseImage("businessLogo")} />
    {draft.businessLogo ? <Image source={{ uri: draft.businessLogo }} style={{ width: 96, height: 96, borderRadius: 14, marginTop: 10 }} /> : null}
  </OnboardingPage>;
}
