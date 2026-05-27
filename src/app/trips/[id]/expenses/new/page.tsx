"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useExpensesStore } from "@/stores/expenses";
import { getExchangeRate } from "@/lib/exchange-rate";
import { CURRENCY_LABELS, CATEGORIES } from "@/types";
import type { Trip, TripMemberWithProfile, ExpenseType, VisibilityType, SplitType } from "@/types";

const expenseSchema = z.object({
  type: z.enum(["personal", "shared"]),
  description: z.string().min(1, "请输入描述"),
  amount: z.coerce.number().positive("金额必须大于 0"),
  currency: z.string(),
  category: z.string(),
  expense_date: z.string(),
  payer_id: z.string().optional(),
  split_type: z.enum(["equal", "custom", "percentage"]).optional(),
});

const categoryIcons: Record<string, string> = {
  food: "🍽️", transport: "🚕", hotel: "🏨", shopping: "🛍️", entertainment: "🎮", other: "📌",
};
const categoryLabels: Record<string, string> = {
  food: "餐饮", transport: "交通", hotel: "酒店", shopping: "购物", entertainment: "娱乐", other: "其他",
};

export default function NewExpensePage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const { createExpense } = useExpensesStore();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [customShares, setCustomShares] = useState<Record<string, number>>({});
  const [percentageShares, setPercentageShares] = useState<Record<string, number>>({});

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      type: "shared",
      currency: "CNY",
      category: "food",
      expense_date: new Date().toISOString().split("T")[0],
      split_type: "equal",
    },
  });

  const expType = watch("type");
  const currency = watch("currency");
  const amount = watch("amount");
  const splitType = watch("split_type");

  // 初始化
  useEffect(() => {
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data }) => {
      if (data) {
        const t = data as Trip;
        setTrip(t);
        setValue("currency", t.base_currency);
      }
    });
    supabase.rpc("get_trip_members", { p_trip_id: tripId }).then(({ data, error }) => {
      if (!error && data) {
        const m: TripMemberWithProfile[] = (data as any[]).map((r: any) => ({
          id: r.member_id, trip_id: r.member_trip_id, profile_id: r.member_profile_id,
          role: r.member_role, joined_at: r.member_joined_at, nickname: r.member_nickname ?? "",
        }));
        setMembers(m);
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) setValue("payer_id", user.id);
        });
      }
    });
  }, [tripId, setValue]);

  // 实时汇率
  useEffect(() => {
    if (!trip || currency === trip.base_currency) { setExchangeRate(1); return; }
    setFetchingRate(true);
    getExchangeRate(currency, trip.base_currency)
      .then((rate) => { setExchangeRate(rate); setFetchingRate(false); })
      .catch(() => setFetchingRate(false));
  }, [currency, trip]);

  const convertedAmount = amount ? (amount * exchangeRate).toFixed(2) : "0.00";
  const tripCurrencies = trip?.currencies || ["CNY"];

  const rawAmount = Number(amount || 0);
  const selectedPids = Object.keys(customShares).filter((k) => customShares[k]);
  const selectedCount = selectedPids.length;
  // 均分：每个人在原币种中的金额
  const equalShareForeign = selectedCount > 0 ? Math.round((rawAmount / selectedCount) * 100) / 100 : 0;
  // 均分转人民币
  const equalShareBase = equalShareForeign * exchangeRate;

  // 自动补全（用原币种计算）
  const autoCompleting = useRef(false);
  useEffect(() => {
    if (!amount || selectedCount < 2 || autoCompleting.current) return;
    if (splitType === "equal") return;

    const selList = selectedPids;
    if (splitType === "custom") {
      const filled = selList.filter((pid) => (customShares[pid] || 0) > 0);
      if (filled.length === selList.length - 1) {
        autoCompleting.current = true;
        const sum = filled.reduce((s, p) => s + (customShares[p] || 0), 0);
        const missing = selList.find((pid) => !filled.includes(pid))!;
        setCustomShares((prev) => ({ ...prev, [missing]: Math.round((rawAmount - sum) * 100) / 100 }));
        setTimeout(() => { autoCompleting.current = false; }, 0);
      }
    } else if (splitType === "percentage") {
      const filled = selList.filter((pid) => (percentageShares[pid] || 0) > 0);
      if (filled.length === selList.length - 1) {
        autoCompleting.current = true;
        const sumPct = filled.reduce((s, p) => s + (percentageShares[p] || 0), 0);
        const missing = selList.find((pid) => !filled.includes(pid))!;
        setPercentageShares((prev) => ({ ...prev, [missing]: 100 - sumPct }));
        setTimeout(() => { autoCompleting.current = false; }, 0);
      }
    }
  }, [customShares, percentageShares, splitType]);

  // 提交
  const onSubmit = async (values: any) => {
    setServerError("");
    setLoading(true);

    const baseAmount = values.currency === (trip?.base_currency || "CNY")
      ? Number(values.amount)
      : Math.round(Number(values.amount) * exchangeRate * 100) / 100;

    let participants: { profile_id: string; share_amount: number }[] = [];

    if (values.type === "shared") {
      const selected = Object.keys(customShares).filter((k) => customShares[k]);
      if (selected.length === 0) { setServerError("请至少选择一个参与人"); setLoading(false); return; }

      if (values.split_type === "equal") {
        const share = Math.round((baseAmount / selected.length) * 100) / 100;
        participants = selected.map((pid) => ({ profile_id: pid, share_amount: share }));
      } else if (values.split_type === "percentage") {
        participants = selected.map((pid) => ({
          profile_id: pid,
          share_amount: Math.round((baseAmount * (percentageShares[pid] || 0) / 100) * 100) / 100,
        }));
      } else {
        // custom: 金额是外币，转人民币存储
        participants = selected.map((pid) => ({
          profile_id: pid,
          share_amount: Math.round((customShares[pid] || 0) * exchangeRate * 100) / 100,
        }));
      }
    }

    const visibility: VisibilityType = values.type === "shared" ? "trip_visible" : "private";

    const result = await createExpense({
      type: values.type as ExpenseType,
      visibility,
      amount: values.amount,
      currency: values.currency,
      exchange_rate: exchangeRate,
      category: values.category,
      description: values.description,
      expense_date: values.expense_date,
      payer_id: values.type === "shared" ? values.payer_id : undefined,
      split_type: values.type === "shared" ? (values.split_type as SplitType) : undefined,
      settlement_mode: undefined,
      participants: values.type === "shared" ? participants : undefined,
    }, tripId);

    setLoading(false);
    if (result.error) { setServerError(result.error); } else { router.push(`/trips/${tripId}`); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center text-gray-500 -ml-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">添加消费</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pt-4 pb-8 space-y-4">
        {/* 消费类型 */}
        <div className="bg-white rounded-2xl p-1 flex">
          {(["shared", "personal"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setValue("type", t as any)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${expType === t ? "bg-black text-white" : "text-gray-500"}`}>
              {t === "shared" ? "公共消费" : "个人消费"}
            </button>
          ))}
        </div>

        {/* 描述 */}
        <div className="bg-white rounded-2xl p-4">
          <input {...register("description")} placeholder="消费描述（例如：晚餐、打车）" className="w-full h-11 text-base placeholder:text-gray-300 focus:outline-none" />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
        </div>

        {/* 金额 + 币种 */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <input {...register("amount")} type="number" step="0.01" inputMode="decimal" placeholder="金额" className="w-full h-11 text-lg font-bold placeholder:text-gray-300 focus:outline-none" />
              {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
            </div>
            <div className="relative">
              <select {...register("currency")} className="h-11 pl-3 pr-8 rounded-xl bg-gray-50 text-sm font-medium focus:outline-none appearance-none">
                {tripCurrencies.map((c) => (
                  <option key={c} value={c}>{CURRENCY_LABELS[c] || c}</option>
                ))}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {/* 实时汇率 */}
          {trip && currency !== trip.base_currency && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">实时汇率 1 {currency} = {fetchingRate ? "加载中..." : exchangeRate.toFixed(4)} {trip.base_currency}</span>
                <button type="button" onClick={async () => {
                  setFetchingRate(true); const rate = await getExchangeRate(currency, trip!.base_currency); setExchangeRate(rate); setFetchingRate(false);
                }} className="text-blue-500 text-xs">刷新</button>
              </div>
              <div className="mt-1 text-sm font-medium text-gray-700">≈ {convertedAmount} {trip.base_currency}</div>
            </div>
          )}
        </div>

        {/* 分类 — 去掉门票 */}
        <div className="bg-white rounded-2xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">分类</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <button key={cat} type="button" onClick={() => setValue("category", cat)}
                className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${watch("category") === cat ? "bg-black text-white" : "bg-gray-50 text-gray-500"}`}>
                <span className="block text-base mb-0.5">{categoryIcons[cat]}</span>{categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* 日期 */}
        <div className="bg-white rounded-2xl p-4">
          <label className="text-sm font-medium text-gray-700">日期</label>
          <input {...register("expense_date")} type="date" className="w-full h-11 mt-1.5 text-base focus:outline-none" />
        </div>

        {/* 个人消费：无需可见性选择，默认仅自己可见 */}

        {/* shared 专用 */}
        {expType === "shared" && (
          <>
            {/* 付款人 */}
            <div className="bg-white rounded-2xl p-4">
              <label className="text-sm font-medium text-gray-700">付款人</label>
              <select {...register("payer_id")} className="w-full h-11 mt-1.5 bg-gray-50 rounded-xl px-3 text-sm focus:outline-none">
                {members.map((m) => (<option key={m.profile_id} value={m.profile_id}>{m.nickname}</option>))}
              </select>
            </div>

            {/* 分账方式 */}
            <div className="bg-white rounded-2xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">分账方式</p>
              <div className="flex gap-2 mb-3">
                {(["equal", "custom", "percentage"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setValue("split_type", s as any)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${splitType === s ? "bg-black text-white" : "bg-gray-50 text-gray-500"}`}>
                    {s === "equal" ? "均分" : s === "percentage" ? "按比例" : "自定义"}
                  </button>
                ))}
              </div>

              {/* 参与人 */}
              <div className="space-y-2">
                {members.map((m) => (
                  <label key={m.profile_id} className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={!!customShares[m.profile_id]}
                      onChange={(e) => {
                        setCustomShares((prev) => {
                          const next = { ...prev };
                          e.target.checked ? next[m.profile_id] = 1 : delete next[m.profile_id];
                          return next;
                        });
                      }}
                      className="w-5 h-5 accent-black rounded" />
                    <span className="flex-1 text-sm text-gray-900">{m.nickname}</span>
                    {customShares[m.profile_id] && splitType === "custom" && (
                      <input type="number" step="0.01" value={customShares[m.profile_id] || ""}
                        onChange={(e) => setCustomShares((prev) => ({ ...prev, [m.profile_id]: parseFloat(e.target.value) || 0 }))}
                        className="w-24 h-8 text-right text-sm bg-gray-50 rounded-lg px-2 focus:outline-none" placeholder="金额" />
                    )}
                    {customShares[m.profile_id] && splitType === "percentage" && (
                      <div className="flex items-center gap-1">
                        <input type="number" step="1" min="0" max="100" value={percentageShares[m.profile_id] || 0}
                          onChange={(e) => setPercentageShares((prev) => ({ ...prev, [m.profile_id]: parseInt(e.target.value) || 0 }))}
                          className="w-16 h-8 text-right text-sm bg-gray-50 rounded-lg px-2 focus:outline-none" />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    )}
                    {customShares[m.profile_id] && splitType === "equal" && amount && (
                      <span className="text-xs text-gray-400">{currency} {equalShareForeign.toFixed(2)}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {serverError && <div className="bg-red-50 rounded-xl px-4 py-3"><p className="text-red-600 text-sm">{serverError}</p></div>}

        <button type="submit" disabled={loading} className="w-full h-12 bg-black text-white rounded-xl text-base font-semibold active:scale-[0.98] transition-all disabled:opacity-50">
          {loading ? "保存中..." : "保存消费"}
        </button>
      </form>
    </div>
  );
}
