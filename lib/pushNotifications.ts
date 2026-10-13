import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export async function registerPushToken(userId: string) {
  if (Platform.OS === "web" || !Device.isDevice || (Platform.OS !== "android" && Platform.OS !== "ios")) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Service updates",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Expo project ID is missing.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc("register_device_push_token", { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  return token;
}

export async function unregisterCurrentPushToken() {
  if (Platform.OS === "web" || !Device.isDevice || (Platform.OS !== "android" && Platform.OS !== "ios")) return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.rpc("unregister_device_push_token", { p_token: token });
  } catch {
    // Auth sign-out should still proceed if the device is offline.
  }
}

export async function setPushPreference(userId: string, enabled: boolean) {
  if (enabled) {
    const token = await registerPushToken(userId);
    if (!token) throw new Error("Push alerts require notification permission on a physical iOS or Android device.");
  }
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    push_enabled: enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function setMatchAlertPreference(userId: string, enabled: boolean) {
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    match_alerts_enabled: enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}
