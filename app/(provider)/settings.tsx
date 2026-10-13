import { router } from "expo-router";
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "../../constants/Colors";
import { RouteScaffold } from "../../components/RouteScaffold";
import { useAuth } from "../../contexts/AuthContext";
import { registerPushToken, setMatchAlertPreference, setPushPreference } from "../../lib/pushNotifications";
import { supabase } from "../../lib/supabase";
import { useEffect, useState } from "react";

export default function ProviderSettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [matchAlertsEnabled, setMatchAlertsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    void supabase.from("notification_preferences").select("push_enabled,match_alerts_enabled").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        setPushEnabled(data?.push_enabled ?? false);
        setMatchAlertsEnabled(data?.match_alerts_enabled ?? true);
        if (data?.push_enabled) void registerPushToken(user.id).catch(() => {});
      });
  }, [user]);
  const updatePush = async (enabled: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try { await setPushPreference(user.id, enabled); setPushEnabled(enabled); }
    catch (e) { Alert.alert("Notification settings", e instanceof Error ? e.message : "Could not update notifications."); }
    finally { setBusy(false); }
  };
  const updateMatchAlerts = async (enabled: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try { await setMatchAlertPreference(user.id, enabled); setMatchAlertsEnabled(enabled); }
    catch (e) { Alert.alert("Notification settings", e instanceof Error ? e.message : "Could not update matched request alerts."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    const { error } = await signOut();
    if (!error) router.replace("/(auth)/welcome");
  };
  return (
    <RouteScaffold eyebrow="Provider" title="Settings" description="Manage your account settings.">
      <TouchableOpacity style={styles.link} onPress={() => router.push("/notifications")}><Text style={styles.linkText}>Notification center</Text></TouchableOpacity>
      <View style={styles.preference}><View style={styles.preferenceCopy}><Text style={styles.label}>Push notifications</Text><Text style={styles.caption}>Alerts for new matched requests</Text></View><Switch value={pushEnabled} onValueChange={updatePush} disabled={busy} /></View>
      <View style={styles.preference}><View style={styles.preferenceCopy}><Text style={styles.label}>Matched request alerts</Text><Text style={styles.caption}>Show provider leads in push notifications</Text></View><Switch value={matchAlertsEnabled} onValueChange={updateMatchAlerts} disabled={busy} /></View>
      <TouchableOpacity style={styles.button} onPress={logout}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({ button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary }, buttonText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" }, link: { minHeight: 48, justifyContent: "center" }, linkText: { color: Colors.primary, fontWeight: "800" }, preference: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 14 }, preferenceCopy: { flex: 1 }, label: { color: Colors.text, fontWeight: "700", fontSize: 15 }, caption: { color: Colors.textSecondary, marginTop: 4 } });
