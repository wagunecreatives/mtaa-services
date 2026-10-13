import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    TextInput,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { Colors } from "../../constants/Colors";
import { useRequestDraft } from "../../contexts/RequestDraftContext";

export default function LocationScreen() {
  const router = useRouter();
  const { draft, update } = useRequestDraft();
  const [loading, setLoading] = useState(false);

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
      Alert.alert("Location error", "Couldn&apos;t get your location.");
    } finally {
      setLoading(false);
    }
  };

  const canContinue = Boolean(draft.areaName.trim() && draft.county.trim());

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step 3 of 5</Text>
      <Text style={styles.title}>Where is the job?</Text>
      <Text style={styles.subtitle}>
        We&apos;ll match you with providers near this location.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Selected location</Text>
        <Text style={styles.cardValue}>
          {draft.address || "No location selected yet"}
        </Text>
      </View>

      <Text style={styles.inputLabel}>Choose location manually</Text>
      <Text style={styles.subtitle}>Enter the place you know. GPS coordinates are optional and can be corrected here.</Text>
      <Text style={styles.inputLabel}>County / town</Text>
      <TextInput
        style={styles.input}
        value={draft.county}
        onChangeText={(county) => update({ county })}
        placeholder="e.g. Kiambu, Ruiru"
        placeholderTextColor={Colors.textSecondary}
      />
      <Text style={styles.inputLabel}>Estate / neighborhood</Text>
      <TextInput
        style={styles.input}
        value={draft.areaName}
        onChangeText={(areaName) => update({ areaName })}
        placeholder="e.g. Membley"
        placeholderTextColor={Colors.textSecondary}
      />
      <Text style={styles.hint}>You can edit these even when GPS is available. Coordinates are optional.</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 64,
    backgroundColor: Colors.background,
  },
  step: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  card: {
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
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
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  hint: { marginTop: 10, color: Colors.textSecondary, fontSize: 13 },
  coordinates: { marginTop: 8, color: Colors.textSecondary, fontSize: 12 },
  primaryButton: {
    height: 54,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
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
    borderColor: Colors.border,
    borderRadius: 14,
  },
  backText: { fontSize: 16, fontWeight: "700", color: Colors.text },
  next: {
    flex: 2,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  nextDisabled: { opacity: 0.5 },
  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textInverse,
  },
});
