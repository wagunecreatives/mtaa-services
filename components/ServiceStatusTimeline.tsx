import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../constants/Colors";

const STEPS = ["REQUESTED", "MATCHED", "ACCEPTED", "IN PROGRESS", "COMPLETED"] as const;
type StepStatus = (typeof STEPS)[number];
type LifecycleStatus = StepStatus | "CANCELLED" | "DISPUTED";
type StatusSource = "request" | "job";

export function getServiceLifecycleStatus(status: string, source: StatusSource): LifecycleStatus {
  if (status === "cancelled") return "CANCELLED";
  if (status === "disputed") return "DISPUTED";

  if (source === "request") {
    if (status === "matching" || status === "responses_received" || status === "provider_selected") {
      return "MATCHED";
    }
    return "REQUESTED";
  }

  if (status === "assigned") return "MATCHED";
  if (status === "accepted" || status === "on_the_way" || status === "arrived") return "ACCEPTED";
  if (status === "in_progress" || status === "awaiting_confirmation") return "IN PROGRESS";
  if (status === "completed") return "COMPLETED";
  return "MATCHED";
}

export function ServiceStatusTimeline({
  status,
  source,
}: {
  status: string;
  source: StatusSource;
}) {
  const currentStatus = getServiceLifecycleStatus(status, source);

  if (currentStatus === "CANCELLED" || currentStatus === "DISPUTED") {
    return (
      <View style={[styles.terminal, currentStatus === "DISPUTED" && styles.disputed]}>
        <Text style={[styles.terminalText, currentStatus === "DISPUTED" && styles.disputedText]}>
          {currentStatus}
        </Text>
      </View>
    );
  }

  const activeIndex = STEPS.indexOf(currentStatus);
  return (
    <View
      style={styles.timeline}
      accessibilityRole="progressbar"
      accessibilityLabel={`Job status: ${currentStatus.toLowerCase()}`}
      accessibilityValue={{ min: 0, max: STEPS.length - 1, now: activeIndex }}
    >
      {STEPS.map((step, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;
        return (
          <View key={step} style={styles.step}>
            <View style={styles.markerRow}>
              {index > 0 ? <View style={[styles.track, index <= activeIndex && styles.trackComplete]} /> : null}
              <View style={[styles.marker, (complete || active) && styles.markerActive]} />
              {index < STEPS.length - 1 ? <View style={[styles.track, index < activeIndex && styles.trackComplete]} /> : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  step: { flex: 1, alignItems: "center" },
  markerRow: { width: "100%", flexDirection: "row", alignItems: "center", height: 16 },
  marker: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.background },
  markerActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  track: { flex: 1, height: 2, backgroundColor: Colors.border },
  trackComplete: { backgroundColor: Colors.primary },
  label: { marginTop: 6, color: Colors.textLight, fontSize: 9, fontWeight: "700", textAlign: "center" },
  labelActive: { color: Colors.primary },
  terminal: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.errorSoft },
  terminalText: { color: Colors.error, fontSize: 12, fontWeight: "900" },
  disputed: { backgroundColor: Colors.accentSoft },
  disputedText: { color: Colors.accentText },
});
