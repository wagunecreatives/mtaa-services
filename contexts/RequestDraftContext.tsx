import {
    createContext,
    useContext,
    useState,
    type ReactNode,
} from "react";

export type Urgency = "now" | "today" | "this_week";

export interface RequestDraft {
  category: string | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  areaName: string;
  county: string;
  urgency: Urgency | null;
}

const emptyDraft: RequestDraft = {
  category: null,
  description: "",
  latitude: null,
  longitude: null,
  address: "",
  areaName: "",
  county: "",
  urgency: null,
};

interface RequestDraftContextValue {
  draft: RequestDraft;
  update: (patch: Partial<RequestDraft>) => void;
  reset: () => void;
}

const RequestDraftContext =
  createContext<RequestDraftContextValue | undefined>(undefined);

export function RequestDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<RequestDraft>(emptyDraft);

  const update = (patch: Partial<RequestDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const reset = () => setDraft(emptyDraft);

  return (
    <RequestDraftContext.Provider
      value={{ draft, update, reset }}
    >
      {children}
    </RequestDraftContext.Provider>
  );
}

export function useRequestDraft() {
  const ctx = useContext(RequestDraftContext);
  if (!ctx) {
    throw new Error(
      "useRequestDraft must be used inside RequestDraftProvider"
    );
  }
  return ctx;
}
