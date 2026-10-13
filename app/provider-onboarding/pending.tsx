import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Text } from "react-native";
import { Action, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { useProviderOnboarding } from "../../contexts/ProviderOnboardingContext";
import { supabase } from "../../lib/supabase";

async function uploadAsset(userId: string, uri: string | null, kind: string) {
  if (!uri) return null;
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  const extension = uri.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() || "jpg";
  const byExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const contentType = (response.headers.get("content-type") || byExtension[extension] || "").split(";")[0].toLowerCase();
  if (!(contentType in { "image/jpeg": true, "image/png": true, "image/webp": true })) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("provider-assets").upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return supabase.storage.from("provider-assets").getPublicUrl(path).data.publicUrl;
}

export default function ProviderPendingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, reset } = useProviderOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submit = async () => {
    if (!user) { Alert.alert("Sign in required", "Sign in to submit your provider application."); return; }
    if (!draft.businessName.trim() || !draft.ownerName.trim() || !draft.phone.trim() || !draft.categoryIds.length || !draft.areas.length) { Alert.alert("Application incomplete", "Complete business details, choose at least one service, and add a service area."); return; }
    setSubmitting(true);
    try {
      const [profilePhotoUrl, businessLogoUrl] = await Promise.all([uploadAsset(user.id, draft.profilePhoto, "profile"), uploadAsset(user.id, draft.businessLogo, "logo")]);
      const { error } = await supabase.rpc("submit_provider_application", {
        p_business_name: draft.businessName.trim(), p_owner_name: draft.ownerName.trim(), p_business_description: draft.description.trim(), p_phone: draft.phone.trim(), p_whatsapp: draft.whatsapp.trim() || null,
        p_profile_photo_url: profilePhotoUrl, p_business_logo_url: businessLogoUrl, p_service_category_ids: draft.categoryIds, p_areas: draft.areas,
        p_county: draft.county.trim(), p_working_hours: { start: draft.startTime, end: draft.endTime }, p_is_available: draft.availableNow,
      });
      if (error) throw error;
      reset();
      setSubmitted(true);
    } catch (error) {
      console.error(error);
      Alert.alert("Couldn't submit application", error instanceof Error ? error.message : "Please try again.");
    } finally { setSubmitting(false); }
  };
  return <OnboardingPage step={submitted ? "Submitted" : "Review"} title={submitted ? "Application pending review" : "Ready to submit?"} footer={submitted ? <Action label="Done" onPress={() => router.replace("/")} /> : <><Action label="Back" secondary onPress={() => router.back()} /><Action label={submitting ? "Submitting…" : "Submit application"} onPress={() => void submit()} disabled={submitting} /></>}>
    {submitting && <ActivityIndicator color={Colors.primary} style={{ marginBottom: 15 }} />}
    <Text style={{ color: Colors.text, fontWeight: "700", fontSize: 17 }}>{draft.businessName || "Business name"}</Text>
    <Text style={{ color: Colors.textSecondary, marginTop: 8 }}>Owner: {draft.ownerName || "—"} · {draft.phone || "—"}</Text>
    <Text style={{ color: Colors.textSecondary, marginTop: 14 }}>Services: {draft.categoryIds.length} selected</Text>
    <Text style={{ color: Colors.textSecondary, marginTop: 6 }}>Areas: {draft.areas.join(", ") || "—"} · {draft.county}</Text>
    <Text style={{ color: Colors.textSecondary, marginTop: 6 }}>Availability: {draft.availableNow ? "Available now" : "Currently unavailable"}, {draft.startTime}–{draft.endTime}</Text>
    <Text style={{ color: Colors.textSecondary, marginTop: 18, lineHeight: 22 }}>{submitted ? "Your application has been saved. Provider features will be available after an administrator approves it." : "Your profile stays pending until an administrator reviews the application."}</Text>
  </OnboardingPage>;
}
