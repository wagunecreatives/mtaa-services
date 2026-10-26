import { createContext, useContext, useState, type ReactNode } from "react";

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

const initial: ProviderDraft = { businessName: "", ownerName: "", whatsapp: "", description: "", profilePhoto: null, businessLogo: null, categoryIds: [], areas: [], county: "Kiambu", availableNow: true, startTime: "08:00", endTime: "20:00" };
const Context = createContext<{ draft: ProviderDraft; update: (patch: Partial<ProviderDraft>) => void; reset: () => void } | null>(null);

export function ProviderOnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(initial);
  return <Context.Provider value={{ draft, update: (patch) => setDraft((current) => ({ ...current, ...patch })), reset: () => setDraft(initial) }}>{children}</Context.Provider>;
}

export function useProviderOnboarding() {
  const context = useContext(Context);
  if (!context) throw new Error("useProviderOnboarding must be inside ProviderOnboardingProvider");
  return context;
}
