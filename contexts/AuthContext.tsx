import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

import { supabase } from "../lib/supabase";
import { unregisterCurrentPushToken } from "../lib/pushNotifications";
import { CURRENT_USER_POLICY_VERSION } from "../lib/userPolicy";

export type UserRole =
  | "customer"
  | "provider"
  | "admin"
  | "super_admin";

export type AccountType =
  | "customer"
  | "provider";

type AuthResultError = Error & {
  code?: string;
  status?: number;
};

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  account_type: AccountType;
  onboarding_completed: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  phone_verification_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userPolicyAccepted: boolean;
  userPolicyAcceptanceChecked: boolean;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    user: User | null;
    error: AuthResultError | null;
  }>;

  resendSignupConfirmation: (email: string) => Promise<{ error: AuthResultError | null }>;

  requestPasswordReset: (email: string) => Promise<{ error: AuthResultError | null }>;

  updatePassword: (password: string) => Promise<{ error: AuthResultError | null }>;

  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountType: AccountType,
    phone: string
  ) => Promise<{ error: AuthResultError | null }>;

  acceptCurrentUserPolicy: () => Promise<void>;

  signOut: () => Promise<{ error: Error | null }>;

  refreshProfile: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] =
    useState<Session | null>(null);

  const [user, setUser] =
    useState<User | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [userPolicyAccepted, setUserPolicyAccepted] = useState(false);
  const [userPolicyAcceptanceChecked, setUserPolicyAcceptanceChecked] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error(
        "Failed to load profile:",
        error
      );

      setProfile(null);
      setUserPolicyAccepted(false);
      setUserPolicyAcceptanceChecked(true);
      return;
    }

    setProfile(data as Profile);
    const { data: acceptance, error: acceptanceError } = await supabase
      .from("user_policy_acceptances")
      .select("policy_version")
      .eq("user_id", userId)
      .maybeSingle();

    if (acceptanceError) {
      console.error("Failed to load user policy acceptance:", acceptanceError);
      setUserPolicyAccepted(false);
    } else {
      setUserPolicyAccepted(acceptance?.policy_version === CURRENT_USER_POLICY_VERSION);
    }
    setUserPolicyAcceptanceChecked(true);
  };

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      setUserPolicyAccepted(false);
      setUserPolicyAcceptanceChecked(false);
      return;
    }

    await loadProfile(user.id);
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadProfile(session.user.id);
      }

      setLoading(false);
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (!nextSession?.user) {
          setProfile(null);
          setUserPolicyAccepted(false);
          setUserPolicyAcceptanceChecked(false);
          setLoading(false);
          return;
        }

        setUserPolicyAcceptanceChecked(false);
        if (event === "SIGNED_IN") setLoading(true);

        setTimeout(() => {
          if (mounted) {
            loadProfile(nextSession.user.id)
              .finally(() => {
                if (mounted) {
                  setLoading(false);
                }
              });
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string
  ) => {
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (data.user && !error) {
      await loadProfile(data.user.id);
    }

    return {
      user: data?.user ?? null,
      error: error
        ? Object.assign(new Error(error.message), {
            code: error.code,
            status: error.status,
          })
        : null,
    };
  };

  const resendSignupConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: Linking.createURL("/auth/callback", {
          scheme: "mtaaservices",
        }),
      },
    });

    return {
      error: error
        ? Object.assign(new Error(error.message), {
            code: error.code,
            status: error.status,
          })
        : null,
    };
  };

  const requestPasswordReset = async (email: string) => {
    const emailRedirectTo = `${Linking.createURL(
      "/auth/callback",
      { scheme: "mtaaservices" }
    )}?flow=recovery`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirectTo,
    });

    return {
      error: error
        ? Object.assign(new Error(error.message), {
            code: error.code,
            status: error.status,
          })
        : null,
    };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });

    return {
      error: error
        ? Object.assign(new Error(error.message), {
            code: error.code,
            status: error.status,
          })
        : null,
    };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    accountType: AccountType,
    phone: string
  ) => {
    // Deep link back into the app after email confirmation
    const emailRedirectTo = Linking.createURL(
      "/auth/callback",
      { scheme: "mtaaservices" }
    );

    const { error } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: fullName,
            account_type: accountType,
            phone_verification_number: phone,
            user_policy_accepted: true,
            user_policy_version: CURRENT_USER_POLICY_VERSION,
          },
        },
      });

    return {
      error: error
        ? Object.assign(new Error(error.message), {
            code: error.code,
            status: error.status,
          })
        : null,
    };
  };

  const acceptCurrentUserPolicy = async () => {
    const { error } = await supabase.rpc("accept_current_user_policy", {
      p_policy_version: CURRENT_USER_POLICY_VERSION,
    });
    if (error) throw new Error(error.message);
    setUserPolicyAccepted(true);
    setUserPolicyAcceptanceChecked(true);
  };

  const signOut = async () => {
    try { await unregisterCurrentPushToken(); } catch { /* Continue signing out if push cleanup is unavailable. */ }
    const { error } =
      await supabase.auth.signOut();

    return {
      error: error
        ? new Error(error.message)
        : null,
    };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userPolicyAccepted,
        userPolicyAcceptanceChecked,
        loading,
        signIn,
        resendSignupConfirmation,
        requestPasswordReset,
        updatePassword,
        signUp,
        acceptCurrentUserPolicy,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}
