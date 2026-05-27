import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Trip, TripWithRole, TripMemberWithProfile } from "@/types";

interface TripsState {
  trips: TripWithRole[];
  currentTrip: Trip | null;
  members: TripMemberWithProfile[];
  loading: boolean;

  fetchTrips: () => Promise<void>;
  createTrip: (name: string, description: string, baseCurrency: string) => Promise<{ error: string | null; id?: string }>;
  completeTrip: (tripId: string) => Promise<void>;
  fetchMembers: (tripId: string) => Promise<void>;
  addMember: (tripId: string, profileId: string) => Promise<{ error: string | null }>;
  removeMember: (tripId: string, profileId: string) => Promise<void>;
}

export const useTripsStore = create<TripsState>((set, get) => ({
  trips: [],
  currentTrip: null,
  members: [],
  loading: false,

  fetchTrips: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const trips = data as Trip[];
      const withRoles: TripWithRole[] = trips.map((t) => ({
        ...t,
        role: "member",
      }));
      set({ trips: withRoles, loading: false });
    } else {
      set({ loading: false });
    }
  },

  createTrip: async (name, description, baseCurrency) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { error: "请先登录" };

    const tripId = crypto.randomUUID();

    const { error } = await supabase
      .from("trips")
      .insert({
        id: tripId,
        name,
        description,
        base_currency: baseCurrency,
        creator_id: user.user.id,
      });

    if (error) return { error: error.message };

    await get().fetchTrips();
    return { error: null, id: tripId };
  },

  completeTrip: async (tripId) => {
    await supabase
      .from("trips")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", tripId);
    await get().fetchTrips();
  },

  fetchMembers: async (tripId) => {
    const { data, error } = await supabase.rpc("get_trip_members", { p_trip_id: tripId });
    if (!error && data) {
      const members: TripMemberWithProfile[] = (data as any[]).map((m) => ({
        id: m.member_id,
        trip_id: m.member_trip_id,
        profile_id: m.member_profile_id,
        role: m.member_role,
        joined_at: m.member_joined_at,
        nickname: m.member_nickname ?? "",
      }));
      set({ members });
    }
  },

  addMember: async (tripId, profileId) => {
    const { error } = await supabase.rpc("add_trip_member", {
      p_trip_id: tripId, p_profile_id: profileId,
    });
    if (error) return { error: error.message };
    await get().fetchMembers(tripId);
    return { error: null };
  },

  removeMember: async (tripId, profileId) => {
    await supabase.rpc("remove_trip_member", {
      p_trip_id: tripId, p_profile_id: profileId,
    });
    await get().fetchMembers(tripId);
  },
}));
