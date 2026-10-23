import { Alert } from "react-native";
import { supabase } from "./supabase";

export function confirmBlockUser(userId: string, name: string, onBlocked?: () => void) {
  Alert.alert(
    "Block this account?",
    `${name} will no longer be matched with you or be able to start new marketplace interactions with your account.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block account",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error } = await supabase.rpc("block_user", { p_user_id: userId });
            if (error) {
              Alert.alert("Could not block account", error.message);
              return;
            }
            Alert.alert("Account blocked", "You can manage blocked accounts in Settings.");
            onBlocked?.();
          })().catch((error: unknown) => {
            Alert.alert("Could not block account", error instanceof Error ? error.message : "Check your connection and try again.");
          });
        },
      },
    ],
  );
}
