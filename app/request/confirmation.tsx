import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Network from "expo-network";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { RequestProgress } from "../../components/RequestProgress";
import { useAuth } from "../../contexts/AuthContext";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import { supabase } from "../../lib/supabase";

type CachedCategory = { id: string; name: string };
const categoryCacheKey = (slug: string) => `mtaa.category.v1.${slug}`;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function uploadRequestPhotos(userId: string, submissionId: string, photos: string[]) {
  const paths: string[] = [];
  for (const [index, uri] of photos.entries()) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("A selected photo could not be read. Remove it and try again.");
    const blob = await response.blob();
    if (blob.size > MAX_PHOTO_BYTES) throw new Error("Request photos must be 5 MB or smaller.");
    const contentType = (blob.type || response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[contentType];
    if (!extension) throw new Error("Request photos must be JPEG, PNG, or WebP images.");

    const path = `${userId}/${submissionId}/${index}.${extension}`;
    const { error } = await supabase.storage
      .from("service-request-photos")
      .upload(path, blob, { contentType, upsert: true });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

async function findCategory(slug: string): Promise<CachedCategory> {
  const { data, error } = await supabase
    .from("service_categories")
    .select("id,name")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!error && data) {
    const category = data as CachedCategory;
    void SecureStore.setItemAsync(categoryCacheKey(slug), JSON.stringify(category)).catch(() => {});
    return category;
  }

  // Use a previously verified category only if the network query failed.
  try {
    const cached = await SecureStore.getItemAsync(categoryCacheKey(slug));
    if (cached) {
      const parsed = JSON.parse(cached) as CachedCategory;
      if (parsed.id && parsed.name) return parsed;
    }
  } catch {
    // A cache failure should not hide the actual network error.
  }
  throw new Error(
    "We couldn't reach the service list. Check your internet connection and try again."
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return "";
}

export default function ConfirmationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, reset, submissionId, queued, queuedForUserId, enqueue, dequeue, ready } = useRequestDraft();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestSaved, setRequestSaved] = useState(false);
  const submissionInProgress = useRef(false);

  const submit = useCallback(async () => {
    if (submissionInProgress.current || !ready) return;
    if (!user) {
      Alert.alert("Not signed in", "Please sign in and try again.");
      return;
    }
    if (queued && queuedForUserId && queuedForUserId !== user.id) {
      setSubmitError("This request was queued for a different account. Sign in with that account to send it.");
      return;
    }
    if (!draft.category) {
      setSubmitError("Choose a service category before sending your request.");
      return;
    }
    if (draft.description.trim().length < 10) {
      setSubmitError("Please describe the job using at least 10 characters.");
      return;
    }
    if (!draft.urgency) {
      setSubmitError("Choose when you need the service.");
      return;
    }

    submissionInProgress.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setRequestSaved(false);
    let requestCommitted = false;
    let queuedOnDevice = false;
    try {
      const network = await Network.getNetworkStateAsync();
      if (network.isConnected === false || network.isInternetReachable === false) {
        await enqueue(user.id);
        queuedOnDevice = true;
        setSubmitError("Your request is saved on this phone and will be sent automatically when internet returns.");
        return;
      }

      const category = await findCategory(draft.category);
      const { data: requestId, error } = await supabase.rpc("create_service_request", {
        p_category_id: category.id,
        p_description: draft.description.trim(),
        p_latitude: draft.latitude,
        p_longitude: draft.longitude,
        p_address: draft.address || null,
        p_area_name: draft.areaName || null,
        p_county: draft.county || null,
        p_urgency: draft.urgency,
        p_client_request_id: submissionId,
      });

      if (error) throw error;
      if (!requestId) {
        throw new Error("We couldn't confirm that your request was saved. Retry safely.");
      }

      requestCommitted = true;
      setRequestSaved(true);
      if (draft.photos.length > 0) {
        const photoPaths = await uploadRequestPhotos(user.id, submissionId, draft.photos);
        const { error: photosError } = await supabase.rpc("set_service_request_photos", {
          p_request_id: requestId,
          p_storage_paths: photoPaths,
        });
        if (photosError) throw photosError;
      }

      // Clear local draft only after the server confirms the request ID.
      reset();
      router.replace({ pathname: "/request/success", params: { requestId } });
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn("Request submission failed; draft retained for retry", error);
      const networkFailure = /network|fetch|timeout|offline|connection|reach the service list/i.test(message);
      if (networkFailure) {
        try {
          await enqueue(user.id);
          queuedOnDevice = true;
        } catch (queueError) {
          console.error("Could not save request to the offline queue", queueError);
        }
      } else if (queued) {
        try {
          await dequeue();
        } catch (queueError) {
          console.error("Could not remove request from the offline queue", queueError);
        }
      }
      const errorMessage = requestCommitted
        ? queuedOnDevice
          ? "Your request was sent, but its photos couldn't be attached. The details are saved; photo upload will retry when internet returns."
          : "Your request was sent, but its photos couldn't be attached. Your details are saved. Tap Retry to finish; it uses the same request ID."
        : networkFailure
        ? queuedOnDevice
          ? "Your request is saved on this phone and will be sent automatically when internet returns. You can also retry now; it won't create a duplicate."
          : "We couldn't reach the service, and couldn't save an offline queue entry. Your request draft is still saved; retry when connected."
        : message || "We couldn't confirm the request was sent. Your details are saved. Tap Retry to safely check again.";
      setSubmitError(errorMessage);
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }, [dequeue, draft, enqueue, queued, queuedForUserId, ready, reset, router, submissionId, user]);

  useEffect(() => {
    if (!queued || !ready || !user || queuedForUserId !== user.id) return;

    let active = true;
    const retryWhenOnline = (isOnline: boolean | undefined) => {
      if (active && isOnline === true) void submit();
    };
    const subscription = Network.addNetworkStateListener((state) => {
      retryWhenOnline(state.isInternetReachable ?? state.isConnected);
    });

    void Network.getNetworkStateAsync()
      .then((state) => retryWhenOnline(state.isInternetReachable ?? state.isConnected))
      .catch((error) => console.warn("Could not check connectivity for queued request", error));

    return () => {
      active = false;
      subscription.remove();
    };
  }, [queued, queuedForUserId, ready, submit, user]);

  const urgencyLabel =
    draft.urgency === "now" ? "Right now" : draft.urgency === "today" ? "Today" : "This week";

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <RequestProgress step={5} />
      <Text style={styles.title}>Review your request</Text>
      <Text style={styles.subtitle}>
        Make sure everything looks right before sending. Your draft is saved on this phone.
      </Text>

      {!ready ? (
        <View style={styles.notice}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.noticeText}>Restoring your saved request…</Text>
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorTitle}>
            {requestSaved ? "Request sent" : queued ? "Request queued offline" : "Couldn&apos;t confirm submission"}
          </Text>
          <Text style={styles.errorText}>{submitError}</Text>
          <Text style={styles.errorHint}>Your draft and request ID are saved locally, so retrying cannot create a duplicate.</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>Category</Text>
        <Text style={styles.value}>{draft.categoryName || draft.category?.replaceAll("-", " ") || "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.value}>{draft.description || "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Location</Text>
        <Text style={styles.value}>{[draft.areaName, draft.county].filter(Boolean).join(", ") || "—"}</Text>
        {draft.address ? <Text style={styles.locationDetail}>{draft.address}</Text> : null}
        {draft.latitude !== null && draft.longitude !== null ? (
          <Text style={styles.locationDetail}>Coordinates: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Urgency</Text>
        <Text style={styles.value}>{draft.urgency ? urgencyLabel : "—"}</Text>
      </View>
      {draft.photos.length ? (
        <View style={styles.row}>
          <Text style={styles.label}>Photos</Text>
          <View style={styles.photoList}>
            {draft.photos.map((uri, index) => (
              <Image key={`${uri}-${index}`} source={{ uri }} style={styles.photoPreview} contentFit="cover" />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} disabled={submitting}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.next, (submitting || !ready) && styles.disabled]}
          onPress={() => void submit()}
          disabled={submitting || !ready}
          accessibilityRole="button"
          accessibilityLabel={submitError ? "Retry sending request" : "Send service request"}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.nextText}>{queued ? "Retry now" : submitError ? "Retry" : "Send request"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 54, paddingBottom: 30, backgroundColor: "#F4F8FD", flexGrow: 1 },
  title: { marginTop: 10, fontSize: 26, fontWeight: "800", color: Colors.text },
  subtitle: { marginTop: 6, marginBottom: 20, fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: Colors.backgroundSecondary },
  noticeText: { color: Colors.textSecondary, fontSize: 14 },
  errorBox: { padding: 14, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.backgroundSecondary, gap: 5 },
  errorTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  errorText: { fontSize: 14, lineHeight: 20, color: Colors.text },
  errorHint: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
  row: { padding: 15, marginBottom: 10, borderWidth: 1, borderColor: "#E8EEF5", borderRadius: 16, backgroundColor: "#FFFFFF" },
  locationDetail: { marginTop: 5, color: Colors.textSecondary, fontSize: 13 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  value: { marginTop: 6, fontSize: 16, fontWeight: "600", color: Colors.text },
  photoList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  photoPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: Colors.border },
  footer: { flexDirection: "row", gap: 12, marginTop: "auto", paddingTop: 24 },
  back: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 14 },
  backText: { fontSize: 16, fontWeight: "700", color: Colors.text },
  next: { flex: 2, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#087BFA" },
  nextText: { fontSize: 16, fontWeight: "700", color: Colors.textInverse },
  disabled: { opacity: 0.6 },
});
