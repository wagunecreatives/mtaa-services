
import { useEffect } from "react";
import { Platform } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { AuthProvider } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

/**
 * Configure how notifications appear while the app is in the foreground.
 * expo-notifications presentation handlers are intended for native platforms.
 */
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Handles navigation when a user taps a push notification.
 *
 * Web skips the native notification-response APIs to prevent runtime errors.
 */
function NotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    let isActive = true;
    let lastHandledNotificationKey: string | null = null;

    const navigate = (notification: Notifications.Notification) => {
      if (!isActive) {
        return;
      }

      const data = notification.request.content.data ?? {};

      const requestId =
        typeof data.requestId === "string"
          ? data.requestId
          : undefined;

      const notificationId =
        typeof data.notificationId === "string"
          ? data.notificationId
          : undefined;

      const jobId =
        typeof data.jobId === "string"
          ? data.jobId
          : undefined;

      // Avoid processing the same notification twice.
      const notificationKey =
        notificationId ??
        notification.request.identifier;

      if (lastHandledNotificationKey === notificationKey) {
        return;
      }

      lastHandledNotificationKey = notificationKey;

      // Mark the notification as read when an ID is supplied.
      if (notificationId) {
        void supabase.rpc("mark_notification_read", {
          p_notification_id: notificationId,
        });
      }

      // Navigate to the destination encoded in the notification payload.
      switch (data.screen) {
        case "/(provider)/leads":
          router.push({
            pathname: "/(provider)/leads",
            params: {
              ...(requestId ? { requestId } : {}),
              ...(notificationId ? { notificationId } : {}),
            },
          });
          break;

        case "/(provider)/jobs":
          router.push({
            pathname: "/(provider)/jobs",
            params: {
              ...(jobId ? { jobId } : {}),
              ...(notificationId ? { notificationId } : {}),
            },
          });
          break;

        case "/(provider)/monetization":
          router.push("/(provider)/monetization" as never);
          break;

        case "/(customer)/requests":
          router.push("/(customer)/requests");
          break;

        default:
          router.push("/notifications");
          break;
      }
    };

    // Listen for notification taps while the app is running.
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          navigate(response.notification);
        }
      );

    // Handle a notification tap that launched or reopened the app.
    const lastResponse =
      Notifications.getLastNotificationResponse();

    if (lastResponse?.notification) {
      navigate(lastResponse.notification);
    }

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, []);

  return null;
}

/**
 * Application root layout.
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationNavigation />

      <StatusBar style="auto" />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="provider-onboarding" />
        <Stack.Screen name="request" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="dispute" />
        <Stack.Screen name="report" />
      </Stack>
    </AuthProvider>
  );
}
