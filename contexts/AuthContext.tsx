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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    user: User | null;
    error: AuthResultError | null;
  }>;

  resendSignupConfirmation: (email: string) => Promise<{ error: AuthResultError | null }>;

  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountType: AccountType
  ) => Promise<{ error: AuthResultError | null }>;

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
      return;
    }

    setProfile(data as Profile);
  };

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
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
      (_event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (!nextSession?.user) {
          setProfile(null);
          setLoading(false);
          return;
        }

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

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    accountType: AccountType
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
        loading,
        signIn,
        resendSignupConfirmation,
        signUp,
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
