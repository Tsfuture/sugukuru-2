import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { buildAuthRedirectUrl, saveReturnToPath } from "@/lib/returnTo";

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  stripe_customer_id: string | null;
  has_payment_method: boolean;
  default_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
}

type OAuthProvider = 'google' | 'twitter' | 'facebook' | 'apple';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithOtp: (email: string, returnTo?: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (returnTo?: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (provider: OAuthProvider, returnTo?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      return data as Profile;
    } catch (err) {
      console.error("Error fetching profile:", err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).then(setProfile);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // returnToを元にredirectToを生成するヘルパー
  // returnTo ユーティリティを使用して、sessionStorage との連携も行う
  const buildRedirectTo = (returnTo?: string): string => {
    // returnToが指定された場合は sessionStorage にも保存
    if (returnTo) {
      saveReturnToPath(returnTo);
    }
    return buildAuthRedirectUrl(returnTo);
  };

  const signInWithOtp = async (email: string, returnTo?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildRedirectTo(returnTo),
      },
    });
    return { error: error as Error | null };
  };

  const signInWithOAuth = async (provider: OAuthProvider, returnTo?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: buildRedirectTo(returnTo),
      },
    });
    return { error: error as Error | null };
  };

  const signInWithGoogle = async (returnTo?: string) => {
    return signInWithOAuth('google', returnTo);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithOtp,
        signInWithGoogle,
        signInWithOAuth,
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
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
