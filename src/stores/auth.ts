import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { generateFakeEmail } from "@/lib/utils";
import type { Profile } from "@/types";

interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;

  signUp: (nickname: string, password: string) => Promise<{ error: string | null }>;
  signIn: (nickname: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,

  signUp: async (nickname, password) => {
    const email = generateFakeEmail(nickname);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname },
      },
    });

    if (error) {
      return { error: error.message };
    }

    if (data.user) {
      set({
        user: { id: data.user.id, email: data.user.email! },
      });
      return { error: null };
    }

    return { error: "注册失败，请重试" };
  },

  signIn: async (nickname, password) => {
    const email = generateFakeEmail(nickname);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (data.user) {
      set({
        user: { id: data.user.id, email: data.user.email! },
      });
      return { error: null };
    }

    return { error: "登录失败，请重试" };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      set({ profile: data as Profile, loading: false });
    } else {
      set({ loading: false });
    }
  },
}));
