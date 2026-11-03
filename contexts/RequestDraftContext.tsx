import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import * as SecureStore from "expo-secure-store";

export type Urgency = "now" | "today" | "this_week";

export interface RequestDraft {
  category: string | null;
  categoryName: string | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  areaName: string;
  county: string;
  urgency: Urgency | null;
  photos: string[];
}

interface PersistedRequestDraft {
  draft: RequestDraft;
  submissionId: string;
  queued?: boolean;
  queuedForUserId?: string | null;
}

const STORAGE_KEY = "mtaa.request-draft.v1";
let persistenceQueue: Promise<void> = Promise.resolve();

const emptyDraft: RequestDraft = {
  category: null,
  categoryName: null,
  description: "",
  latitude: null,
  longitude: null,
  address: "",
  areaName: "",
  county: "",
  urgency: null,
  photos: [],
};

// This ID is an idempotency key, not an authentication secret.
function createSubmissionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function readPersistedDraft(): Promise<PersistedRequestDraft | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? typeof localStorage !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null
        : await SecureStore.getItemAsync(STORAGE_KEY);

    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRequestDraft>;
    if (!parsed.draft || typeof parsed.submissionId !== "string") return null;

    return {
      draft: { ...emptyDraft, ...parsed.draft },
      submissionId: parsed.submissionId,
    };
  } catch {
    // A corrupted/unavailable cache must not prevent a user from making a request.
    return null;
  }
}

async function persistDraft(value: PersistedRequestDraft): Promise<void> {
  const write = async () => {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, raw);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, raw);
  };
  const pendingWrite = persistenceQueue.then(write, write);
  persistenceQueue = pendingWrite.catch(() => {});
  await pendingWrite;
}


interface RequestDraftContextValue {
  draft: RequestDraft;
  submissionId: string;
  queued: boolean;
  queuedForUserId: string | null;
  ready: boolean;
  update: (patch: Partial<RequestDraft>) => void;
  enqueue: (userId: string) => Promise<void>;
  dequeue: () => Promise<void>;
  reset: () => void;
}

const RequestDraftContext =
  createContext<RequestDraftContextValue | undefined>(undefined);

export function RequestDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<RequestDraft>(emptyDraft);
  const [submissionId, setSubmissionId] = useState(createSubmissionId);
  const [queued, setQueued] = useState(false);
  const [queuedForUserId, setQueuedForUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void readPersistedDraft().then((saved) => {
      if (!active) return;
      if (saved) {
        setDraft(saved.draft);
        setSubmissionId(saved.submissionId);
        setQueued(saved.queued === true);
        setQueuedForUserId(saved.queuedForUserId ?? null);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void persistDraft({ draft, submissionId, queued, queuedForUserId }).catch((error) => {
      console.warn("Could not persist request draft locally", error);
    });
  }, [draft, submissionId, queued, queuedForUserId, ready]);

  const update = (patch: Partial<RequestDraft>) =>
    setDraft((previous) => ({ ...previous, ...patch }));

  const enqueue = async (userId: string) => {
    await persistDraft({ draft, submissionId, queued: true, queuedForUserId: userId });
    setQueued(true);
    setQueuedForUserId(userId);
  };

  const dequeue = async () => {
    await persistDraft({ draft, submissionId, queued: false, queuedForUserId: null });
    setQueued(false);
    setQueuedForUserId(null);
  };

  const reset = () => {
    // Let the persistence effect replace the old draft atomically with a fresh one.
    // Deleting and writing concurrently could otherwise lose a new draft on slow storage.
    setDraft(emptyDraft);
    setSubmissionId(createSubmissionId());
    setQueued(false);
    setQueuedForUserId(null);
  };

  if (!ready) {
    return (
      <View style={styles.restoreScreen}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.restoreText}>Restoring your saved request…</Text>
      </View>
    );
  }

  return (
    <RequestDraftContext.Provider
      value={{ draft, submissionId, queued, queuedForUserId, ready, update, enqueue, dequeue, reset }}
    >
      {children}
    </RequestDraftContext.Provider>
  );
}

export function useRequestDraft() {
  const context = useContext(RequestDraftContext);
  if (!context) {
    throw new Error("useRequestDraft must be used inside RequestDraftProvider");
  }
  return context;
}


const styles = StyleSheet.create({
  restoreScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: Colors.background, gap: 12 },
  restoreText: { color: Colors.textSecondary, fontSize: 14, textAlign: "center" },
});
