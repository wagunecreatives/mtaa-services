import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "../constants/Colors";
import { directionsUrl, serviceContactMessage, whatsappUrl } from "../lib/contact";

type Destination = {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  areaName: string | null;
  county: string | null;
};

export function ContactActions({
  phone,
  whatsappPhone,
  service,
  area,
  destination,
}: {
  phone: string | null;
  whatsappPhone?: string | null;
  service: string | null | undefined;
  area: string | null | undefined;
  destination?: Destination | null;
}) {
  const mapUrl = destination ? directionsUrl(destination) : null;
  const message = serviceContactMessage(service, area);
  const whatsappTarget = whatsappPhone || phone;

  const open = async (url: string, title: string, fallback: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(title, fallback);
    }
  };

  return (
    <View style={styles.actions}>
      {phone ? (
        <TouchableOpacity
          style={styles.action}
          onPress={() => void open(`tel:${phone}`, "Contact unavailable", "This device cannot open the phone app.")}
          accessibilityRole="button"
          accessibilityLabel="Call"
        >
          <Ionicons name="call-outline" size={18} color={Colors.primary} />
          <Text style={styles.label}>Call</Text>
        </TouchableOpacity>
      ) : null}
      {whatsappTarget ? (
        <TouchableOpacity
          style={styles.action}
          onPress={() => void open(whatsappUrl(whatsappTarget, message), "WhatsApp unavailable", "Could not open WhatsApp.")}
          accessibilityRole="button"
          accessibilityLabel="WhatsApp"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.successText} />
          <Text style={[styles.label, styles.whatsapp]}>WhatsApp</Text>
        </TouchableOpacity>
      ) : null}
      {mapUrl ? (
        <TouchableOpacity
          style={styles.action}
          onPress={() => void open(mapUrl, "Directions unavailable", "Could not open a maps app.")}
          accessibilityRole="button"
          accessibilityLabel="Directions"
        >
          <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
          <Text style={styles.label}>Directions</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  action: {
    flex: 1,
    minWidth: 105,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  label: { color: Colors.primary, fontSize: 13, fontWeight: "800" },
  whatsapp: { color: Colors.successText },
});
