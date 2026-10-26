import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { RequestProgress } from "../../components/RequestProgress";
import { useRequestDraft } from "../../contexts/RequestDraftContext";
import { supabase } from "../../lib/supabase";

type ServiceArea = { area_name: string; county: string };

async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from("platform_service_areas")
    .select("area_name,county")
    .eq("is_active", true)
    .order("sort_order")
    .order("area_name");
  if (error) throw error;
  return data ?? [];
}

export default function LocationScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();
  const [loading, setLoading] = useState(false);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchServiceAreas()
      .then((areas) => {
        if (active) setServiceAreas(areas);
      })
      .catch((error) => {
        console.warn("Could not load active service areas", error);
        if (active) {
          setAreasError("Service areas could not be loaded. You can still enter your location manually.");
        }
      })
      .finally(() => {
        if (active) setAreasLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const retryServiceAreas = async () => {
    setAreasLoading(true);
    setAreasError(null);
    try {
      setServiceAreas(await fetchServiceAreas());
    } catch (error) {
      console.warn("Could not load active service areas", error);
      setAreasError("Service areas could not be loaded. You can still enter your location manually.");
    } finally {
      setAreasLoading(false);
    }
  };

  const selectServiceArea = (area: ServiceArea) => {
    update({
      areaName: area.area_name,
      county: area.county,
      address: `${area.area_name}, ${area.county}`,
      latitude: null,
      longitude: null,
    });
  };

  const useCurrentLocation = async () => {
    try {
      setLoading(true);

      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "We need location access to find providers near you."
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      const formatted = place
        ? [place.name, place.street, place.city, place.region]
            .filter(Boolean)
            .join(", ")
        : `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;

      const areaName = place?.district || place?.name || place?.city || "";
      const county = place?.subregion || place?.region || "";

      update({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        address: formatted,
        areaName,
        county,
      });
    } catch (err) {
      console.error(err);
      Alert.alert("Location error", "Couldn't get your location.");
    } finally {
      setLoading(false);
    }
  };

  const canContinue = Boolean(draft.areaName.trim() && draft.county.trim());

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <RequestProgress step={3} />
      <Text style={styles.title}>Where is the job?</Text>
      <Text style={styles.subtitle}>
        We&apos;ll match you with providers near this location.
      </Text>

      <Text style={styles.inputLabel}>Choose a service area</Text>
      {areasLoading ? (
        <ActivityIndicator color={Colors.primary} style={styles.areaLoader} />
      ) : serviceAreas.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaChoices}>
          {serviceAreas.map((area) => {
            const selected = draft.areaName === area.area_name && draft.county === area.county;
            return (
              <TouchableOpacity
                key={`${area.county}:${area.area_name}`}
                style={[styles.areaChoice, selected && styles.areaChoiceSelected]}
                onPress={() => selectServiceArea(area)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${area.area_name}, ${area.county}`}
              >
                <Text style={[styles.areaChoiceText, selected && styles.areaChoiceTextSelected]}>
                  {area.area_name}
                </Text>
                <Text style={[styles.areaCountyText, selected && styles.areaChoiceTextSelected]}>
                  {area.county}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
      {areasError ? (
        <View style={styles.areaError}>
          <Text style={styles.hint}>{areasError}</Text>
          <TouchableOpacity onPress={() => void retryServiceAreas()} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Selected location</Text>
        <Text style={styles.cardValue}>
          {draft.address || [draft.areaName, draft.county].filter(Boolean).join(", ") || "No location selected yet"}
        </Text>
      </View>

      <Text style={styles.inputLabel}>Or enter a location manually</Text>
      <Text style={styles.manualHint}>GPS coordinates are optional. You can correct the area below.</Text>
      <Text style={styles.inputLabel}>County / town</Text>
      <TextInput
        style={styles.input}
        value={draft.county}
        onChangeText={(county) => update({
          county,
          address: [draft.areaName, county].filter(Boolean).join(", "),
          latitude: null,
          longitude: null,
        })}
        placeholder="e.g. Kiambu, Ruiru"
        placeholderTextColor={Colors.textSecondary}
      />
      <Text style={styles.inputLabel}>Estate / neighborhood</Text>
      <TextInput
        style={styles.input}
        value={draft.areaName}
        onChangeText={(areaName) => update({
          areaName,
          address: [areaName, draft.county].filter(Boolean).join(", "),
          latitude: null,
          longitude: null,
        })}
        placeholder="e.g. Membley"
        placeholderTextColor={Colors.textSecondary}
      />
      <Text style={styles.hint}>Editing the area uses your corrected address instead of GPS coordinates.</Text>
      {draft.latitude !== null && draft.longitude !== null ? (
        <Text style={styles.coordinates}>Coordinates: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={useCurrentLocation}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textInverse} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {canContinue ? "Update location" : "Use my current location"}
          </Text>
        )}
      </TouchableOpacity>

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
          onPress={() => router.push("/request/urgency")}
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
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  inputLabel: { marginTop: 16, marginBottom: 7, color: Colors.text, fontWeight: "700" },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: "#DCE4EE", borderRadius: 13, color: Colors.text, backgroundColor: "#FFFFFF" },
  hint: { marginTop: 10, color: Colors.textSecondary, fontSize: 13 },
  manualHint: { marginTop: -3, marginBottom: 2, color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  coordinates: { marginTop: 8, color: Colors.textSecondary, fontSize: 12 },
  areaLoader: { paddingVertical: 12 },
  areaChoices: { gap: 8, paddingBottom: 4 },
  areaChoice: { minHeight: 48, justifyContent: "center", paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: "#E8EEF5", borderRadius: 14, backgroundColor: "#FFFFFF" },
  areaChoiceSelected: { borderColor: "#087BFA", backgroundColor: "#EAF3FF" },
  areaChoiceText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  areaChoiceTextSelected: { color: "#087BFA" },
  areaCountyText: { marginTop: 2, color: Colors.textSecondary, fontSize: 11 },
  areaError: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: Colors.errorSoft },
  retryText: { color: Colors.primary, fontSize: 13, fontWeight: "800" },
  primaryButton: {
    height: 54,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#087BFA",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
  },
  back: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE4EE",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
  },
  backText: { fontSize: 16, fontWeight: "700", color: Colors.text },
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
