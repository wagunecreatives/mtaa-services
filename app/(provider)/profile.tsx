import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ProviderAvatar } from "../../components/provider/ProviderAvatar";
import { VerifiedBadge } from "../../components/provider/VerifiedBadge";
import { Colors } from "../../constants/Colors";
import { BorderRadius, Shadow } from "../../constants/Theme";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

const MAX_PORTFOLIO_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ProviderProfile = {
  business_name: string;
  bio: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  profile_image_url: string | null;
  rating_average: number | null;
  total_reviews: number | null;
  verification_status: string;
  is_available: boolean;
};

type PortfolioImage = {
  id: string;
  storage_path: string;
  created_at: string;
};

async function uploadPortfolioImage(userId: string, uri: string, index: number) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("A selected image could not be read. Please choose it again.");

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Images must be 5 MB or smaller.");

  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const uriExtension = uri.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() || "";
  const extensionMimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const responseContentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
  const contentType = extensions[responseContentType]
    ? responseContentType
    : extensionMimeTypes[uriExtension] || "";
  const extension = extensions[contentType];
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");

  const path = `${userId}/portfolio-${Date.now()}-${index}.${extension}`;
  const { error } = await supabase.storage.from("provider-assets").upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export default function ProviderProfileScreen() {
  const { profile: accountProfile, user } = useAuth();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyImage, setBusyImage] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profileResult, portfolioResult] = await Promise.all([
        supabase
          .from("providers")
          .select("business_name,bio,phone,whatsapp_number,profile_image_url,rating_average,total_reviews,verification_status,is_available")
          .eq("id", user.id)
          .single(),
        supabase
          .from("provider_portfolio_images")
          .select("id,storage_path,created_at")
          .eq("provider_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (portfolioResult.error) throw portfolioResult.error;

      const provider = profileResult.data as ProviderProfile;
      setProfile(provider);
      setBusinessName(provider.business_name || "");
      setBio(provider.bio || "");
      setWhatsapp(provider.whatsapp_number || "");
      setPhotoUri(provider.profile_image_url);
      setPortfolio((portfolioResult.data ?? []) as PortfolioImage[]);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your provider profile.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const saveProfile = async () => {
    if (!user || !profile || saving) return;
    if (!businessName.trim()) {
      Alert.alert("Business name required", "Add a business name before saving your profile.");
      return;
    }

    setSaving(true);
    let uploadedPhotoPath: string | null = null;
    let cleanupWarning: string | null = null;
    try {
      let profileImageUrl = profile.profile_image_url;
      if (photoUri && photoUri !== profile.profile_image_url) {
        const path = await uploadPortfolioImage(user.id, photoUri, 0);
        uploadedPhotoPath = path;
        profileImageUrl = supabase.storage.from("provider-assets").getPublicUrl(path).data.publicUrl;
      } else if (!photoUri) {
        profileImageUrl = null;
      }

      const { error: updateError } = await supabase
        .from("providers")
        .update({
          business_name: businessName.trim(),
          bio: bio.trim() || null,
          whatsapp_number: whatsapp.trim() || null,
          profile_image_url: profileImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (updateError) throw updateError;

      if (profile.profile_image_url && (uploadedPhotoPath || !profileImageUrl)) {
        const previousPath = profile.profile_image_url.split("/provider-assets/")[1];
        if (previousPath?.startsWith(`${user.id}/`)) {
          const { error: cleanupError } = await supabase.storage.from("provider-assets").remove([previousPath]);
          if (cleanupError) cleanupWarning = cleanupError.message;
        }
      }
      await load();
      Alert.alert(
        cleanupWarning ? "Profile saved with a cleanup warning" : "Profile saved",
        cleanupWarning ? `Your profile was updated, but the previous photo could not be deleted: ${cleanupWarning}` : "Your provider profile is up to date.",
      );
    } catch (saveError) {
      if (uploadedPhotoPath) {
        const { error: cleanupError } = await supabase.storage.from("provider-assets").remove([uploadedPhotoPath]);
        if (cleanupError) console.warn("Could not remove an unsaved provider photo", cleanupError);
      }
      Alert.alert("Couldn't save profile", saveError instanceof Error ? saveError.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const pickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled) setPhotoUri(result.assets[0].uri);
    } catch (pickerError) {
      Alert.alert("Photo library unavailable", pickerError instanceof Error ? pickerError.message : "Please try again.");
    }
  };

  const addPortfolioImages = async () => {
    const remaining = MAX_PORTFOLIO_IMAGES - portfolio.length;
    if (!user || remaining <= 0 || busyImage) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });
      if (result.canceled) return;

      setBusyImage(true);
      for (const [index, asset] of result.assets.entries()) {
        const path = await uploadPortfolioImage(user.id, asset.uri, index + 1);
        const { data: imageId, error: addError } = await supabase.rpc("add_provider_portfolio_image", {
          p_storage_path: path,
        });
        if (addError || typeof imageId !== "string") {
          const { error: cleanupError } = await supabase.storage.from("provider-assets").remove([path]);
          if (cleanupError) console.warn("Could not remove an unregistered portfolio image", cleanupError);
          if (addError) throw addError;
          throw new Error("The uploaded image could not be added to your profile.");
        }
        setPortfolio((current) => [...current, {
          id: imageId,
          storage_path: path,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (uploadError) {
      Alert.alert("Couldn't add work photos", uploadError instanceof Error ? uploadError.message : "Please try again.");
    } finally {
      setBusyImage(false);
    }
  };

  const deletePortfolioImage = (image: PortfolioImage) => {
    Alert.alert("Remove this work photo?", "It will no longer appear on your provider profile.", [
      { text: "Keep photo", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (deletingImageId) return;
          setDeletingImageId(image.id);
          try {
            const { data: storagePath, error: removeError } = await supabase.rpc("remove_provider_portfolio_image", {
              p_image_id: image.id,
            });
            if (removeError) throw removeError;
            const { error: storageError } = await supabase.storage.from("provider-assets").remove([storagePath]);
            if (storageError) {
              Alert.alert("Photo removed from profile", `The image file could not be deleted: ${storageError.message}`);
            }
            setPortfolio((current) => current.filter((item) => item.id !== image.id));
          } catch (removeError) {
            Alert.alert("Couldn't remove photo", removeError instanceof Error ? removeError.message : "Please try again.");
          } finally {
            setDeletingImageId(null);
          }
        },
      },
    ]);
  };

  const updateAvailability = async (isAvailable: boolean) => {
    if (!user || !profile || saving) return;
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("providers")
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, is_available: isAvailable });
    } catch (updateError) {
      Alert.alert("Availability not updated", updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = businessName.trim() || accountProfile?.full_name || "Your business";

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>Provider workspace</Text>
      <Text style={styles.title}>Your profile</Text>
      <Text style={styles.subtitle}>Help customers understand your services and see the quality of your work.</Text>

      {loading ? <ActivityIndicator color={Colors.primary} /> : null}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!loading && profile ? (
        <>
          <View style={styles.hero}>
            <ProviderAvatar name={displayName} photoUrl={photoUri} size={82} />
            <View style={styles.heroDetails}>
              <Text style={styles.businessName} numberOfLines={2}>{displayName}</Text>
              <Text style={styles.status}>{profile.verification_status === "verified" ? "Provider active" : profile.verification_status}</Text>
              {user?.email_confirmed_at ? <VerifiedBadge /> : null}
              <Text style={styles.rating}>
                {profile.rating_average != null ? `${profile.rating_average.toFixed(1)} ★` : "New provider"}
                {profile.total_reviews ? ` · ${profile.total_reviews} reviews` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Business details</Text>
            <Text style={styles.label}>Business name</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Your business name"
              placeholderTextColor={Colors.textLight}
              maxLength={100}
            />
            <Text style={styles.label}>About your business</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={bio}
              onChangeText={setBio}
              placeholder="Describe your experience, services, and what customers can expect."
              placeholderTextColor={Colors.textLight}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.label}>WhatsApp number</Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="Add a WhatsApp contact number"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
              maxLength={30}
            />
            <Text style={styles.phoneNote}>Verified phone: {profile.phone || "Not available"}</Text>

            <Text style={styles.label}>Profile photo</Text>
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void pickProfilePhoto()}>
                <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>{photoUri ? "Change photo" : "Add photo"}</Text>
              </TouchableOpacity>
              {photoUri ? (
                <TouchableOpacity style={styles.clearPhotoButton} onPress={() => setPhotoUri(null)}>
                  <Text style={styles.clearPhotoText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.disabledButton]}
              onPress={() => void saveProfile()}
              disabled={saving}
            >
              <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save profile"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.availabilityRow}>
              <View style={styles.availabilityCopy}>
                <Text style={styles.sectionTitle}>Accepting new requests</Text>
                <Text style={styles.helper}>Turn this off when you are not taking new work.</Text>
              </View>
              <Switch
                value={profile.is_available}
                onValueChange={(value) => void updateAvailability(value)}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor={Colors.card}
                disabled={saving}
                accessibilityLabel="Accepting new service requests"
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.galleryHeader}>
              <View style={styles.galleryCopy}>
                <Text style={styles.sectionTitle}>Work gallery</Text>
                <Text style={styles.helper}>{portfolio.length} of {MAX_PORTFOLIO_IMAGES} photos · JPEG, PNG, or WebP up to 5 MB</Text>
              </View>
              <TouchableOpacity
                style={[styles.addButton, (busyImage || portfolio.length >= MAX_PORTFOLIO_IMAGES) && styles.disabledButton]}
                onPress={() => void addPortfolioImages()}
                disabled={busyImage || portfolio.length >= MAX_PORTFOLIO_IMAGES}
                accessibilityRole="button"
                accessibilityLabel="Add work photos"
              >
                {busyImage ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <Ionicons name="add" size={23} color={Colors.textInverse} />}
              </TouchableOpacity>
            </View>
            {portfolio.length ? (
              <View style={styles.gallery}>
                {portfolio.map((image) => (
                  <View key={image.id} style={styles.galleryItem}>
                    <Image
                      source={{ uri: supabase.storage.from("provider-assets").getPublicUrl(image.storage_path).data.publicUrl }}
                      style={styles.galleryImage}
                      contentFit="cover"
                      transition={150}
                      accessibilityLabel="Provider work photo"
                    />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => deletePortfolioImage(image)}
                      disabled={deletingImageId !== null}
                      accessibilityRole="button"
                      accessibilityLabel="Remove work photo"
                    >
                      {deletingImageId === image.id
                        ? <ActivityIndicator size="small" color={Colors.textInverse} />
                        : <Ionicons name="close" size={17} color={Colors.textInverse} />}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyGallery}>Add a few photos of completed jobs to build customer confidence.</Text>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 56, paddingBottom: 36, gap: 16, backgroundColor: Colors.background },
  eyebrow: { color: Colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { marginTop: -8, color: Colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { marginTop: -10, color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: BorderRadius.xl, backgroundColor: Colors.primarySoft, ...Shadow.card },
  heroDetails: { flex: 1, gap: 5 },
  businessName: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  status: { color: Colors.successText, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  rating: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  card: { padding: 16, gap: 10, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  label: { marginTop: 5, color: Colors.text, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.text, fontSize: 15 },
  multiline: { minHeight: 112 },
  phoneNote: { marginTop: -4, color: Colors.textSecondary, fontSize: 12 },
  photoActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md },
  secondaryButtonText: { color: Colors.primary, fontSize: 14, fontWeight: "700" },
  clearPhotoButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 10 },
  clearPhotoText: { color: Colors.error, fontWeight: "700" },
  primaryButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 6, borderRadius: BorderRadius.md, backgroundColor: Colors.primary },
  primaryButtonText: { color: Colors.textInverse, fontSize: 15, fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
  availabilityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  availabilityCopy: { flex: 1, gap: 4 },
  helper: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  galleryHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  galleryCopy: { flex: 1, gap: 4 },
  addButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.primary },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 5 },
  galleryItem: { width: "31%", aspectRatio: 1, position: "relative", overflow: "hidden", borderRadius: BorderRadius.md, backgroundColor: Colors.backgroundTertiary },
  galleryImage: { width: "100%", height: "100%" },
  removeImageButton: { position: "absolute", top: 5, right: 5, width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.overlay },
  emptyGallery: { paddingVertical: 10, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { padding: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.errorSoft, color: Colors.error, fontSize: 13 },
});
