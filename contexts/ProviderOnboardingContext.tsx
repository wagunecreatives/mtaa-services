import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Colors } from "../constants/Colors";

export type ProviderDraft = {
  businessName: string;
  ownerName: string;
  whatsapp: string;
  description: string;
  profilePhoto: string | null;
  businessLogo: string | null;
  categoryIds: string[];
  areas: string[];
  county: string;
  availableNow: boolean;
  startTime: string;
  endTime: string;
};

const initial: ProviderDraft = {
  businessName: "",
  ownerName: "",
  whatsapp: "",
  description: "",
  profilePhoto: null,
  businessLogo: null,
  categoryIds: [],
  areas: [],
  county: "Kiambu",
  availableNow: true,
  startTime: "08:00",
  endTime: "20:00",
};

const STORAGE_KEY_PREFIX = "mtaa.provider-onboarding.v1";
let persistenceQueue: Promise<void> = Promise.resolve();
const Context = createContext<{
  draft: ProviderDraft;
  ready: boolean;
  update: (patch: Partial<ProviderDraft>) => void;
  reset: () => void;
} | null>(null);

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}.${userId}`;
}

async function readDraft(userId: string): Promise<ProviderDraft> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage !== "undefined"
        ? localStorage.getItem(storageKey(userId))
        : null
      : await SecureStore.getItemAsync(storageKey(userId));

  if (!raw) return initial;

  const parsed = JSON.parse(raw) as Partial<ProviderDraft>;
  return {
    ...initial,
    ...parsed,
    categoryIds: Array.isArray(parsed.categoryIds) ? parsed.categoryIds : [],
    areas: Array.isArray(parsed.areas) ? parsed.areas : [],
  };
}

async function persistDraft(userId: string, draft: ProviderDraft) {
  const write = async () => {
    const key = storageKey(userId);
    const serialized = JSON.stringify(draft);
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, serialized);
      return;
    }
    await SecureStore.setItemAsync(key, serialized);
  };
  const pendingWrite = persistenceQueue.then(write, write);
  persistenceQueue = pendingWrite.catch(() => {});
  await pendingWrite;
}

export function ProviderOnboardingProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readDraft(userId)
      .then((saved) => {
        if (active) {
          setDraft(saved);
          setPersistenceError(null);
        }
      })
      .catch((error) => {
        console.warn("Could not restore provider onboarding progress", error);
        if (active) setPersistenceError("Saved provider setup could not be restored. Your new progress may not be recoverable if you leave this device.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    void persistDraft(userId, draft)
      .then(() => setPersistenceError(null))
      .catch((error) => {
        console.warn("Could not persist provider onboarding progress", error);
        setPersistenceError("Provider setup progress could not be saved on this device. Keep this screen open and try again later.");
      });
  }, [draft, ready, userId]);

  const update = (patch: Partial<ProviderDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const reset = () => setDraft(initial);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background, gap: 12 }}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary }}>Restoring your provider setup…</Text>
      </View>
    );
  }

  return (
    <Context.Provider value={{ draft, ready, update, reset }}>
      <View style={{ flex: 1 }}>
        {persistenceError ? (
          <Text accessibilityRole="alert" style={{ backgroundColor: "#FFF4E5", color: Colors.text, padding: 12, lineHeight: 19 }}>
            {persistenceError}
          </Text>
        ) : null}
        {children}
      </View>
    </Context.Provider>
  );
}

export function useProviderOnboarding() {
  const context = useContext(Context);
  if (!context) throw new Error("useProviderOnboarding must be inside ProviderOnboardingProvider");
  return context;
}
