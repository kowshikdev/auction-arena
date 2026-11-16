"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/types";

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Signs in as a guest (Supabase anonymous user) with the given display name. */
  continueAsGuest: (displayName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = supabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_admin, is_guest")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile | null) ?? null);
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Deferred: Supabase forbids awaiting its own client inside this callback.
        setTimeout(() => void loadProfile(session.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const continueAsGuest = useCallback(
    async (displayName: string) => {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return error.message;
      if (data.user) await loadProfile(data.user.id);
      return null;
    },
    [supabase, loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const value = useMemo(
    () => ({ user, profile, loading, continueAsGuest, signOut, refreshProfile }),
    [user, profile, loading, continueAsGuest, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
