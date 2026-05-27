import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { computeBalances, simplifyDebts } from "@/lib/settlement";
import type { Settlement, BalanceItem, DebtEdge } from "@/types";

interface SettlementState {
  balances: BalanceItem[];
  simplifiedDebts: DebtEdge[];
  settlements: Settlement[];
  loading: boolean;

  fetchSettlements: (tripId: string) => Promise<void>;
  calculateDebts: (tripId: string) => Promise<void>;
  createSettlement: (
    tripId: string,
    toProfileId: string,
    amount: number,
    currency: string,
    exchangeRate: number
  ) => Promise<{ error: string | null }>;
}

export const useSettlementStore = create<SettlementState>((set, get) => ({
  balances: [],
  simplifiedDebts: [],
  settlements: [],
  loading: false,

  fetchSettlements: async (tripId) => {
    set({ loading: true });
    const { data } = await supabase
      .from("settlements")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });

    if (data) {
      set({ settlements: data as Settlement[], loading: false });
    } else {
      set({ loading: false });
    }
  },

  calculateDebts: async (tripId) => {
    // 获取所有 shared 消费及其参与人
    const { data: expenses } = await supabase
      .from("expenses")
      .select("*, creator:creator_id(nickname), payer:payer_id(nickname)")
      .eq("trip_id", tripId)
      .eq("type", "shared");

    if (!expenses) return;

    // 为每个消费获取参与人
    const fullExpenses = await Promise.all(
      (expenses as any[]).map(async (e) => {
        const { data: parts } = await supabase
          .from("expense_participants")
          .select("*, profiles(nickname)")
          .eq("expense_id", e.id);

        return {
          payer_id: e.payer_id,
          payer_nickname: e.payer?.nickname ?? "",
          base_amount: e.base_amount,
          participants: (parts as any[] || []).map((p: any) => ({
            profile_id: p.profile_id,
            nickname: p.profiles?.nickname ?? "",
            share_amount: p.share_amount,
          })),
        };
      })
    );

    const balances = computeBalances(fullExpenses);
    const simplifiedDebts = simplifyDebts(balances);

    set({ balances, simplifiedDebts });
  },

  createSettlement: async (tripId, toProfileId, amount, currency, exchangeRate) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { error: "请先登录" };

    const baseAmount =
      currency === "CNY"
        ? amount
        : Math.round(amount * exchangeRate * 100) / 100;

    const { error } = await supabase
      .from("settlements")
      .insert({
        trip_id: tripId,
        from_profile_id: user.user.id,
        to_profile_id: toProfileId,
        amount,
        currency,
        exchange_rate: exchangeRate,
        base_amount: baseAmount,
      });

    if (error) return { error: error.message };

    await get().fetchSettlements(tripId);
    await get().calculateDebts(tripId);
    return { error: null };
  },
}));
