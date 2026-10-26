import Constants from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;

  if (Platform.OS === "web" || (Platform.OS === "android" && Constants.expoGoConfig)) {
    cached = null;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch (error) {
    console.warn("expo-notifications is unavailable in this runtime:", error);
    cached = null;
  }

  return cached;
}
