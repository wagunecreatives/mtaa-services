import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteScaffold } from "../components/RouteScaffold";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";

type BlockedUser = {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  role: string;
  blocked_at: string;
};

export default function BlockedUsersScreen() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("list_blocked_users");
    if (rpcError) setError(rpcError.message);
    else {
      setBlockedUsers((data ?? []) as BlockedUser[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const unblock = (blocked: BlockedUser) => {
    Alert.alert("Unblock account?", `${blocked.business_name || blocked.full_name || "This account"} may be matched or interact with you again.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: () => {
          setBusyId(blocked.user_id);
          void (async () => {
            try {
              const { error: rpcError } = await supabase.rpc("unblock_user", { p_user_id: blocked.user_id });
              if (rpcError) throw new Error(rpcError.message);
              await load();
            } catch (actionError) {
              setError(actionError instanceof Error ? actionError.message : "Could not unblock account.");
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  return <RouteScaffold eyebrow="Safety" title="Blocked accounts" description="Manage accounts you have blocked. Blocking prevents new marketplace interactions between your accounts.">
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !blockedUsers.length && !error && <Text style={styles.muted}>You have not blocked any accounts.</Text>}
    {blockedUsers.map((blocked) => <View key={blocked.user_id} style={styles.card}>
      <View style={styles.identity}>
        <Text style={styles.name}>{blocked.business_name || blocked.full_name || "Account"}</Text>
        <Text style={styles.muted}>{blocked.role.replaceAll("_", " ")} · blocked {new Date(blocked.blocked_at).toLocaleDateString()}</Text>
      </View>
      <TouchableOpacity style={styles.button} disabled={busyId !== null} onPress={() => unblock(blocked)}>
        <Text style={styles.buttonText}>{busyId === blocked.user_id ? "Unblocking…" : "Unblock"}</Text>
      </TouchableOpacity>
    </View>)}
  </RouteScaffold>;
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary },
  identity: { flex: 1, gap: 4 },
  name: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  muted: { color: Colors.textSecondary, lineHeight: 20 },
  button: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10, backgroundColor: Colors.primary },
  buttonText: { color: "#fff", fontWeight: "800" },
  error: { color: Colors.error },
});
