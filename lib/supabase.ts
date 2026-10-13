import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Web uses localStorage (with an SSR guard), native uses SecureStore.
const isWeb = Platform.OS === "web";
const isServer = typeof window === "undefined";

const storage = isWeb
  ? {
      getItem: (key: string) =>
        isServer ? null : window.localStorage.getItem(key),
      setItem: (key: string, value: string) => {
        if (!isServer) window.localStorage.setItem(key, value);
      },
      removeItem: (key: string) => {
        if (!isServer) window.localStorage.removeItem(key);
      },
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) =>
        SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
  },
});