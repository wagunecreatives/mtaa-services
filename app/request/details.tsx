import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useState } from "react";
import {
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { RequestProgress } from "../../components/RequestProgress";
import { useRequestDraft } from "../../contexts/RequestDraftContext";

export default function DetailsScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();
  const [pickingPhotos, setPickingPhotos] = useState(false);

  const canContinue = draft.description.trim().length >= 10;

  const addPhotos = async () => {
    if (pickingPhotos || draft.photos.length >= 3) return;
    setPickingPhotos(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 3 - draft.photos.length,
        quality: 0.75,
      });
      if (!result.canceled) {
        update({ photos: [...draft.photos, ...result.assets.map((asset) => asset.uri)].slice(0, 3) });
      }
    } catch (error) {
      console.warn("Could not select request photos", error);
      Alert.alert("Photo selection failed", "Please try selecting your photos again.");
    } finally {
      setPickingPhotos(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <RequestProgress step={2} />
      <Text style={styles.title}>Describe the job</Text>
      <Text style={styles.subtitle}>
        Explain what is wrong and include any useful details.
      </Text>

      <TextInput
        value={draft.description}
        onChangeText={(v) => update({ description: v })}
        placeholder="e.g. Kitchen sink is leaking under the cabinet..."
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={6}
        maxLength={2000}
        textAlignVertical="top"
        style={styles.textarea}
      />
      <Text style={styles.hint}>
        {draft.description.trim().length < 10
          ? `At least 10 characters required (${draft.description.trim().length}/10).`
          : `${draft.description.length}/2000 characters`}
      </Text>

      <View style={styles.photosSection}>
        <View style={styles.photosHeading}>
          <View>
            <Text style={styles.photosTitle}>Add photos (optional)</Text>
            <Text style={styles.photosHint}>Show providers what needs attention. Up to 3 photos.</Text>
          </View>
          <TouchableOpacity
            style={styles.addPhotoButton}
            onPress={() => void addPhotos()}
            disabled={pickingPhotos || draft.photos.length >= 3}
            accessibilityRole="button"
            accessibilityLabel="Add request photos"
          >
            {pickingPhotos
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={styles.addPhotoText}>{draft.photos.length ? "Add" : "Choose"}</Text>}
          </TouchableOpacity>
        </View>
        {draft.photos.length ? (
          <View style={styles.photoList}>
            {draft.photos.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.photoPreview}>
                <Image source={{ uri }} style={styles.photoImage} contentFit="cover" />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() => update({ photos: draft.photos.filter((_, photoIndex) => photoIndex !== index) })}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.next,
            !canContinue && styles.nextDisabled,
          ]}
          disabled={!canContinue}
          onPress={() => router.push("/request/location")}
        >
          <Text style={styles.nextText}>Continue</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: { flexGrow: 1, padding: 20, paddingTop: 54, paddingBottom: 30, backgroundColor: "#F4F8FD" },
  title: {
    marginTop: 17,
    fontSize: 23,
    fontWeight: "900",
    color: Colors.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  textarea: {
    minHeight: 145,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    color: Colors.text,
    fontSize: 15,
  },
  hint: { marginTop: 8, color: Colors.textSecondary, fontSize: 13 },
  photosSection: { marginTop: 20, padding: 14, borderWidth: 1, borderColor: "#E8EEF5", borderRadius: 17, backgroundColor: "#FFFFFF" },
  photosHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  photosTitle: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  photosHint: { marginTop: 4, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  addPhotoButton: { minWidth: 70, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#E8F2FF" },
  addPhotoText: { color: "#087BFA", fontSize: 13, fontWeight: "800" },
  photoList: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  photoPreview: { position: "relative" },
  photoImage: { width: 76, height: 76, borderRadius: 12, backgroundColor: Colors.border },
  removePhoto: { position: "absolute", top: -6, right: -6, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.text },
  removePhotoText: { color: Colors.textInverse, fontSize: 17, lineHeight: 20, fontWeight: "800" },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
    paddingTop: 20,
  },
  back: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE4EE",
    borderRadius: 14,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  next: {
    flex: 2,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#087BFA",
  },
  nextDisabled: { opacity: 0.5 },
  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
});