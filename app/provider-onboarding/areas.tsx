import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { Action, Field, OnboardingPage } from "../../components/ProviderOnboardingUI";
import { Colors } from "../../constants/Colors";
import { useProviderOnboarding } from "../../contexts/ProviderOnboardingContext";
import { supabase } from "../../lib/supabase";

type Area = { area_name: string; county: string };
export default function ProviderAreasScreen() {
  const router = useRouter();
  const { draft, update } = useProviderOnboarding();
  const [available, setAvailable] = useState<Area[]>([]);
  const [newArea, setNewArea] = useState("");
  useEffect(() => { void supabase.from("platform_service_areas").select("area_name,county").eq("is_active", true).order("sort_order").then(({ data }) => setAvailable(data ?? [])); }, []);
  const toggle = (name: string) => update({ areas: draft.areas.includes(name) ? draft.areas.filter((item) => item !== name) : [...draft.areas, name] });
  const addArea = () => { const name = newArea.trim(); if (!name) return; if (!draft.areas.includes(name)) update({ areas: [...draft.areas, name] }); setNewArea(""); };
  const matching = available.filter((area) => area.county.toLowerCase().includes(draft.county.toLowerCase()) || area.area_name.toLowerCase().includes(draft.county.toLowerCase()));
  return <OnboardingPage step="3 of 3 · Service area" title="Where do you work?" footer={<><Action label="Back" secondary onPress={() => router.back()} /><Action label="Review and submit" onPress={() => { if (!draft.areas.length) { Alert.alert("Add a service area", "Choose or add at least one neighborhood."); return; } router.push("/provider-onboarding/pending"); }} /></>}>
    <Field label="County" value={draft.county} onChangeText={(county) => update({ county })} placeholder="Kiambu" />
    <Text style={{ color: Colors.text, fontWeight: "700", marginBottom: 10 }}>Select neighborhoods</Text>
    {matching.map((area) => { const selected = draft.areas.includes(area.area_name); return <TouchableOpacity key={`${area.county}:${area.area_name}`} onPress={() => toggle(area.area_name)} style={{ padding: 14, borderWidth: 1, borderColor: selected ? Colors.primary : Colors.border, borderRadius: 11, marginBottom: 8, backgroundColor: selected ? "#EFF6FF" : Colors.backgroundSecondary }}><Text style={{ color: Colors.text, fontWeight: "600" }}>{selected ? "✓  " : "＋  "}{area.area_name} · {area.county}</Text></TouchableOpacity>; })}
    {!matching.length && <Text style={{ color: Colors.textSecondary, marginBottom: 14 }}>No listed neighborhoods match this county. Add your area below.</Text>}
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}><View style={{ flex: 1 }}><Field label="Add neighborhood" value={newArea} onChangeText={setNewArea} placeholder="Membley, Kamakis, Kihunguro..." /></View><View style={{ paddingBottom: 16 }}><Action label="Add" onPress={addArea} /></View></View>
    {!!draft.areas.length && <Text style={{ color: Colors.textSecondary }}>Selected: {draft.areas.join(", ")}</Text>}
    <View style={{ borderTopWidth: 1, borderColor: Colors.border, marginTop: 18, paddingTop: 18 }}><Text style={{ color: Colors.text, fontWeight: "700", marginBottom: 10 }}>Availability</Text><View style={{ flexDirection: "row", gap: 8 }}><Action label="Available now" secondary={!draft.availableNow} onPress={() => update({ availableNow: true })} /><Action label="Not now" secondary={draft.availableNow} onPress={() => update({ availableNow: false })} /></View><View style={{ flexDirection: "row", gap: 10, marginTop: 15 }}><View style={{ flex: 1 }}><Field label="Start (24 hour)" value={draft.startTime} onChangeText={(startTime) => update({ startTime })} placeholder="08:00" /></View><View style={{ flex: 1 }}><Field label="End (24 hour)" value={draft.endTime} onChangeText={(endTime) => update({ endTime })} placeholder="20:00" /></View></View></View>
  </OnboardingPage>;
}
