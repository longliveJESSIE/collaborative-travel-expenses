import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseFull, ExpenseForm } from "@/types";

interface ExpensesState {
  expenses: ExpenseFull[];
  loading: boolean;

  fetchExpenses: (tripId: string) => Promise<void>;
  createExpense: (form: ExpenseForm, tripId: string) => Promise<{ error: string | null; id?: string }>;
  deleteExpense: (expenseId: string) => Promise<void>;
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: [],
  loading: false,

  fetchExpenses: async (tripId) => {
    set({ loading: true });

    const { data: expenses } = await supabase
      .from("expenses")
      .select("*, creator:creator_id(nickname), payer:payer_id(nickname)")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

    if (!expenses) {
      set({ loading: false });
      return;
    }

    // 获取每个 shared expense 的 participants
    const fullExpenses: ExpenseFull[] = await Promise.all(
      (expenses as any[]).map(async (e) => {
        let participants: any[] = [];
        if (e.type === "shared") {
          const { data: parts } = await supabase
            .from("expense_participants")
            .select("*, profiles(nickname)")
            .eq("expense_id", e.id);

          participants = (parts as any[] || []).map((p: any) => ({
            id: p.id,
            expense_id: p.expense_id,
            profile_id: p.profile_id,
            share_amount: p.share_amount,
            nickname: p.profiles?.nickname ?? "",
          }));
        }

        return {
          ...(e as Expense),
          creator_nickname: e.creator?.nickname ?? "",
          payer_nickname: e.payer?.nickname ?? undefined,
          participants,
        };
      })
    );

    set({ expenses: fullExpenses, loading: false });
  },

  createExpense: async (form, tripId) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { error: "请先登录" };

    const baseAmount =
      form.currency === "CNY"
        ? form.amount
        : Math.round(form.amount * form.exchange_rate * 100) / 100;

    const expenseId = crypto.randomUUID();

    const { error } = await supabase
      .from("expenses")
      .insert({
        id: expenseId,
        trip_id: tripId,
        creator_id: user.user.id,
        type: form.type,
        visibility: form.visibility,
        amount: form.amount,
        currency: form.currency,
        exchange_rate: form.exchange_rate,
        base_amount: baseAmount,
        category: form.category,
        description: form.description,
        expense_date: form.expense_date,
        payer_id: form.type === "shared" ? form.payer_id : null,
        split_type: form.type === "shared" ? form.split_type : null,
        settlement_mode: null,
      });

    if (error) return { error: error.message };

    // 插入 participants（shared only）
    if (form.type === "shared" && form.participants?.length) {
      await supabase.from("expense_participants").insert(
        form.participants.map((p) => ({
          expense_id: expenseId,
          profile_id: p.profile_id,
          share_amount: p.share_amount,
        }))
      );
    }

    await get().fetchExpenses(tripId);
    return { error: null, id: expenseId };
  },

  deleteExpense: async (expenseId) => {
    await supabase.from("expenses").delete().eq("id", expenseId);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== expenseId) }));
  },
}));
