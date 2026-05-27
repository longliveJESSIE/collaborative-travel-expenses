"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { getExchangeRate } from "@/lib/exchange-rate";
import { computeBalances, simplifyDebts } from "@/lib/settlement";
import { CURRENCY_LABELS } from "@/types";
import type { Trip, ExpenseFull, DebtEdge } from "@/types";

type SettleMode = "cny" | "foreign" | "original";

export default function SettlePage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allExpenses, setAllExpenses] = useState<ExpenseFull[]>([]);
  const [settledExpenseIds, setSettledExpenseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [resultDebts, setResultDebts] = useState<(DebtEdge & { currency?: string })[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [settleMode, setSettleMode] = useState<SettleMode>("cny");
  const [settleForeignCurrency, setSettleForeignCurrency] = useState("");
  const [settleMsg, setSettleMsg] = useState("");
  const [lastSettledIds, setLastSettledIds] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setMyUserId(user.id); });
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data }) => {
      if (data) {
        const t = data as Trip; setTrip(t);
        setSettleForeignCurrency((t.currencies || ["CNY"]).find((c) => c !== t.base_currency) || t.base_currency);
      }
    });
    fetchData();
  }, [tripId]);

  async function fetchData() {
    const { data: expenses } = await supabase.from("expenses")
      .select("*, creator:creator_id(nickname), payer:payer_id(nickname)")
      .eq("trip_id", tripId).order("expense_date", { ascending: false });
    if (!expenses) { setLoading(false); return; }

    const full: ExpenseFull[] = await Promise.all((expenses as any[]).map(async (e) => {
      let participants: any[] = [];
      if (e.type === "shared") {
        const { data: parts } = await supabase.from("expense_participants")
          .select("*, profiles(nickname)").eq("expense_id", e.id);
        participants = (parts || []).map((p: any) => ({
          id: p.id, expense_id: p.expense_id, profile_id: p.profile_id,
          share_amount: p.share_amount, nickname: p.profiles?.nickname ?? "",
        }));
      }
      return { ...e, creator_nickname: e.creator?.nickname ?? "", payer_nickname: e.payer?.nickname ?? "", participants };
    }));

    // 从 settled_at 精准读取已结算状态
    const settledIds = new Set(full.filter((e) => (e as any).settled_at).map((e) => e.id));
    setSettledExpenseIds(settledIds);

    setAllExpenses(full);
    setLoading(false);
  }

  const sharedExpenses = useMemo(() => allExpenses.filter((e) => e.type === "shared"), [allExpenses]);
  const dateGroups = useMemo(() => {
    const map = new Map<string, ExpenseFull[]>();
    for (const e of sharedExpenses) {
      const list = map.get(e.expense_date) || [];
      list.push(e); map.set(e.expense_date, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sharedExpenses]);

  function toggleSelect(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function selectAll() {
    if (sharedExpenses.every((e) => selected.has(e.id))) setSelected(new Set());
    else setSelected(new Set(sharedExpenses.map((e) => e.id)));
  }

  async function calculate() {
    const sel = allExpenses.filter((e) => selected.has(e.id) && e.type === "shared");
    if (sel.length === 0) { alert("请至少选择一笔公共消费"); return; }

    if (settleMode === "cny") {
      // 全用人民币：直接 CNY 计算
      const debts = calcDebts(sel, "CNY", 1);
      setResultDebts(debts.map((d) => ({ ...d, currency: "CNY" })));
    } else if (settleMode === "foreign") {
      // 全用外币：CNY 计算后换算到目标外币
      const rate = await getExchangeRate(settleForeignCurrency, trip?.base_currency || "CNY");
      const debts = calcDebts(sel, settleForeignCurrency, 1 / rate);
      setResultDebts(debts.map((d) => ({ ...d, currency: settleForeignCurrency })));
    } else {
      // 各自货币：按原币种分组独立计算
      const byCurrency = new Map<string, ExpenseFull[]>();
      sel.forEach((e) => { const list = byCurrency.get(e.currency) || []; list.push(e); byCurrency.set(e.currency, list); });

      let allDebts: (DebtEdge & { currency?: string })[] = [];
      for (const [cur, exps] of byCurrency) {
        const rate = exps[0]?.exchange_rate || 1;
        // 按该币种计算（CNY 内部计算，再换算回原币种显示）
        const debts = calcDebts(exps, cur, 1 / rate);
        allDebts = allDebts.concat(debts.map((d) => ({ ...d, currency: cur })));
      }
      setResultDebts(allDebts);
    }
    setShowResult(true);
  }

  // 计算选定消费的债务（金额单位：displayCurrency）
  function calcDebts(expenses: ExpenseFull[], displayCurrency: string, convertRate: number): DebtEdge[] {
    const data = expenses.map((e) => ({
      payer_id: e.payer_id!, payer_nickname: e.payer_nickname || "",
      base_amount: e.base_amount, participants: e.participants,
    }));
    const balances = computeBalances(data);
    const debts = simplifyDebts(balances);
    if (convertRate === 1) return debts;
    return debts.map((d) => ({ ...d, amount: Math.round((d.amount * convertRate) * 100) / 100 }));
  }

  function getSettleCurrency(): string {
    if (settleMode === "cny") return trip?.base_currency || "CNY";
    if (settleMode === "foreign") return settleForeignCurrency;
    return ""; // 各自货币，每条 debt 自带 currency
  }

  async function doSettle() {
    if (!trip || resultDebts.length === 0) return;
    if (!confirm(`确认结算全部 ${resultDebts.length} 笔债务？`)) return;

    const ids: string[] = [];
    for (const d of resultDebts) {
      const sid = crypto.randomUUID();
      const curr = d.currency || getSettleCurrency() || (trip?.base_currency || "CNY");
      const sel = allExpenses.filter((e) => selected.has(e.id) && e.type === "shared");
      const rate = curr !== (trip?.base_currency || "CNY")
        ? await getExchangeRate(curr, trip?.base_currency || "CNY")
        : 1;
      const baseAmount = Math.round(d.amount * rate * 100) / 100;

      await supabase.from("settlements").insert({
        id: sid, trip_id: tripId, from_profile_id: d.from_profile_id, to_profile_id: d.to_profile_id,
        amount: d.amount, currency: curr, exchange_rate: rate, base_amount: baseAmount,
      });
      ids.push(sid);
    }

    // 标记已结算（写入 DB）
    const selArr = Array.from(selected);
    await supabase.from("expenses").update({ settled_at: new Date().toISOString() }).in("id", selArr);
    setSettledExpenseIds((prev) => { const n = new Set(prev); selArr.forEach((id) => n.add(id)); return n; });

    setLastSettledIds(ids);
    setSettleMsg(`已结算 ${resultDebts.length} 笔债务`);
    setShowResult(false); setSelected(new Set());
    await fetchData();
    setTimeout(() => setSettleMsg(""), 3000);
  }

  async function handleUndo() {
    if (lastSettledIds.length === 0) { alert("没有可撤销的记录"); return; }
    if (!confirm(`撤销最近 ${lastSettledIds.length} 笔结算？`)) return;
    for (const sid of lastSettledIds) {
      await supabase.from("settlements").delete().eq("id", sid);
    }
    // 清除这些 settlement 对应的 expense 的 settled_at
    const { data: sRows } = await supabase.from("settlements").select("id").eq("trip_id", tripId);
    const hasSettlements = sRows && sRows.length > 0;
    if (!hasSettlements) {
      await supabase.from("expenses").update({ settled_at: null }).eq("trip_id", tripId);
    }
    setLastSettledIds([]);
    setSettledExpenseIds(new Set());
    setSettleMsg(`已撤销`);
    await fetchData();
    setTimeout(() => setSettleMsg(""), 2000);
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">加载中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/trips")} className="text-base text-gray-500 flex items-center gap-1 mr-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>返回
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">结算</h1>
          <button onClick={selectAll} className="text-sm text-blue-600 font-medium">
            {sharedExpenses.every((e) => selected.has(e.id)) ? "取消全选" : "全选"}
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {settleMsg && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700">{settleMsg}</div>
        )}

        {selected.size > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">已选 {selected.size} 笔</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400">清除</button>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">结算货币</p>
              <div className="flex gap-1.5">
                {(["cny", "foreign", "original"] as const).map((m) => (
                  <button key={m} onClick={() => setSettleMode(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${settleMode === m ? "bg-black text-white" : "bg-gray-50 text-gray-500"}`}>
                    {m === "cny" ? "全用人民币" : m === "foreign" ? "全用外币" : "各自货币"}
                  </button>
                ))}
              </div>
              {settleMode === "foreign" && (
                <select value={settleForeignCurrency} onChange={(e) => setSettleForeignCurrency(e.target.value)}
                  className="w-full h-9 mt-2 bg-gray-50 rounded-lg px-2 text-xs focus:outline-none">
                  {(trip?.currencies || ["CNY"]).filter((c) => c !== (trip?.base_currency || "CNY")).map((c) => (
                    <option key={c} value={c}>{CURRENCY_LABELS[c] || c}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={calculate} className="flex-1 h-10 bg-black text-white rounded-xl text-sm font-semibold">计算结算</button>
              {Array.from(selected).some((id) => settledExpenseIds.has(id)) && (
                <button onClick={async () => {
                  const selSettled = Array.from(selected).filter((id) => settledExpenseIds.has(id));
                  if (selSettled.length === 0) return;
                  if (!confirm(`撤销选中的 ${selSettled.length} 笔已结算消费？`)) return;
                  await supabase.from("expenses").update({ settled_at: null }).in("id", selSettled);
                  setSettledExpenseIds((prev) => { const n = new Set(prev); selSettled.forEach((id) => n.delete(id)); return n; });
                  setLastSettledIds([]);
                  setSettleMsg(`已撤销 ${selSettled.length} 笔`);
                  await fetchData();
                  setTimeout(() => setSettleMsg(""), 2000);
                }} className="h-10 px-4 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium">撤销</button>
              )}
            </div>
          </div>
        )}

        {showResult && (
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">结算结果</h2>
              <button onClick={() => setShowResult(false)} className="text-gray-400 text-xs">关闭</button>
            </div>
            {resultDebts.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium">{d.from_nickname}</span>
                  <span className="text-gray-300">→</span>
                  <span className="font-medium">{d.to_nickname}</span>
                </div>
                <span className="text-sm font-bold">
                  {formatCurrency(d.amount, d.currency || getSettleCurrency())}
                </span>
              </div>
            ))}
            {resultDebts.length === 0 && <p className="text-gray-400 text-sm text-center py-2">已结清</p>}
            {resultDebts.length > 0 && (
              <button onClick={doSettle} className="w-full h-10 bg-green-600 text-white rounded-xl text-sm font-semibold mt-2">确认结算</button>
            )}
          </div>
        )}

        {dateGroups.map(([date, items]) => (
          <div key={date} className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">{date}</span>
            </div>
            {items.map((e) => {
              const isSettled = settledExpenseIds.has(e.id);
              return (
              <label key={e.id}
                className={`flex items-center gap-3 px-4 py-3 border-t border-gray-50 cursor-pointer ${
                  selected.has(e.id) ? "bg-blue-50" : isSettled ? "bg-green-50" : "bg-orange-50/40"
                }`}>
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="w-4 h-4 accent-black rounded" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900 truncate">{e.description || "无描述"}</p>
                    {isSettled ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full">已结算</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">待结算</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{e.payer_nickname || e.creator_nickname} · {e.category}</p>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(e.amount, e.currency)}</span>
              </label>
              );
            })}
          </div>
        ))}

        {sharedExpenses.length === 0 && (
          <div className="text-center mt-20 text-gray-400 text-sm">还没有公共消费</div>
        )}
      </div>

    </div>
  );
}
