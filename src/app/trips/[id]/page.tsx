"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useExpensesStore } from "@/stores/expenses";
import { useAuthStore } from "@/stores/auth";
import { formatCurrency } from "@/lib/utils";
import PieChart from "@/components/ui/PieChart";
import type { Trip, ExpenseFull } from "@/types";

const categoryLabels: Record<string, string> = {
  food: "餐饮", transport: "交通", hotel: "酒店", shopping: "购物", entertainment: "娱乐", other: "其他",
};

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, fetchProfile } = useAuthStore();
  const { expenses, loading, fetchExpenses } = useExpensesStore();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showChartDate, setShowChartDate] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.replace("/login"); return; }
      setMyUserId(session.user.id);
      useAuthStore.setState({ user: { id: session.user.id, email: session.user.email! } });
      fetchProfile(session.user.id);
    });
    supabase.from("trips").select("*").eq("id", id).single().then(({ data }) => { if (data) setTrip(data as Trip); setInitialized(true); });
    fetchExpenses(id);
  }, [id, router, fetchProfile, fetchExpenses]);

  // 按日期分组
  const dateGroups = useMemo(() => {
    const map = new Map<string, ExpenseFull[]>();
    for (const e of expenses) {
      const list = map.get(e.expense_date) || [];
      list.push(e); map.set(e.expense_date, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({ date, items }));
  }, [expenses]);

  function toggleSelect(expenseId: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(expenseId) ? n.delete(expenseId) : n.add(expenseId); return n; });
  }
  function toggleDate(date: string) {
    const items = dateGroups.find((g) => g.date === date)?.items || [];
    const allSelected = items.every((e) => selected.has(e.id));
    setSelected((prev) => { const n = new Set(prev); items.forEach((e) => allSelected ? n.delete(e.id) : n.add(e.id)); return n; });
  }

  // 选中项总统计
  const selectedTotal = useMemo(() => {
    let personalTotal = 0, sharedMyShare = 0;
    for (const e of expenses) {
      if (!selected.has(e.id)) continue;
      if (e.type === "personal") {
        personalTotal += e.base_amount;
      } else {
        const myShare = e.participants?.find((p) => p.profile_id === myUserId)?.share_amount || 0;
        sharedMyShare += myShare;
      }
    }
    return { personalTotal, sharedMyShare, total: personalTotal + sharedMyShare };
  }, [selected, expenses, myUserId]);

  if (!initialized || !user) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/trips")} className="text-base text-gray-500 flex items-center gap-1 mr-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{trip?.name ?? "..."}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-24">
        {loading ? (
          <p className="text-gray-400 text-center mt-20">加载中...</p>
        ) : expenses.length === 0 ? (
          <div className="text-center mt-20">
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium mb-1">还没有消费记录</p>
            <p className="text-gray-400 text-sm">点击右下角 + 添加第一笔消费</p>
          </div>
        ) : (
          <>
            {/* 已选统计条 */}
            {selected.size > 0 && (() => {
              const selExpenses = expenses.filter((e) => selected.has(e.id));
              const myTotal = selectedTotal.sharedMyShare + selectedTotal.personalTotal;
              const byCurrency: Record<string, number> = {};
              selExpenses.forEach((e) => {
                const myForeign = e.type === "personal"
                  ? Number(e.amount)
                  : (e.participants?.find((p) => p.profile_id === myUserId)?.share_amount || 0) / (e.exchange_rate || 1);
                byCurrency[e.currency] = (byCurrency[e.currency] || 0) + myForeign;
              });
              const parts = Object.entries(byCurrency).filter(([, v]) => v > 0).map(([c, v]) => formatCurrency(v, c));
              return (
              <div className="bg-black text-white rounded-2xl p-4 mb-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-300">已选 {selected.size} 笔 · 我的支出</p>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400">清除</button>
                </div>
                {parts.length > 0 && <p className="text-xs text-gray-300">{parts.join(" + ")}</p>}
                <p className="text-lg font-bold">{formatCurrency(myTotal, trip?.base_currency || "CNY")}</p>
              </div>
              );
            })()}

            {/* 所有统计按钮 */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowChartDate(showChartDate === "__all__" ? null : "__all__")}
                className={`text-xs px-2 py-1 rounded-lg ${showChartDate === "__all__" ? "bg-blue-50 text-blue-600" : "text-gray-400"}`}
              >
                所有统计
              </button>
            </div>
            {showChartDate === "__all__" && (() => {
              const catMap: Record<string, number> = {};
              expenses.forEach((e) => {
                const myShare = e.type === "shared"
                  ? e.participants?.find((p) => p.profile_id === myUserId)?.share_amount || 0
                  : e.base_amount;
                catMap[e.category] = (catMap[e.category] || 0) + myShare;
              });
              const chartData = Object.entries(catMap).map(([cat, val]) => ({
                label: categoryLabels[cat] || cat,
                value: Math.round(val * 100) / 100,
              }));
              return (
                <div className="bg-white rounded-2xl p-4 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">全部消费分类统计</h3>
                  <PieChart data={chartData} currency={trip?.base_currency || "CNY"} />
                </div>
              );
            })()}

            {/* 按日期分组 */}
            {dateGroups.map(({ date, items }) => (
              <div key={date} className="mb-4">
                {/* 日期标题 */}
                <div className="flex items-center justify-between px-1 py-2">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleDate(date)}>
                    <span className="text-sm font-semibold text-gray-500">{date}</span>
                    <span className="text-xs text-gray-400">{items.length} 笔</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowChartDate(showChartDate === date ? null : date); }}
                    className={`text-xs ${showChartDate === date ? "text-blue-600" : "text-gray-400"}`}
                  >
                    统计
                  </button>
                </div>

                {/* 饼图 */}
                {showChartDate === date && (() => {
                  const catMap: Record<string, number> = {};
                  items.forEach((e) => {
                    const myShare = e.type === "shared"
                      ? e.participants?.find((p) => p.profile_id === myUserId)?.share_amount || 0
                      : e.base_amount;
                    catMap[e.category] = (catMap[e.category] || 0) + myShare;
                  });
                  const chartData = Object.entries(catMap).map(([cat, val]) => ({
                    label: categoryLabels[cat] || cat,
                    value: Math.round(val * 100) / 100,
                  }));
                  return <PieChart data={chartData} currency={trip?.base_currency || "CNY"} />;
                })()}

                <div className="space-y-1.5">
                  {items.map((exp) => {
                    const myShare = exp.type === "shared"
                      ? exp.participants?.find((p) => p.profile_id === myUserId)?.share_amount
                      : null;
                    return (
                    <div key={exp.id}
                      className={`bg-white rounded-xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform ${
                        selected.has(exp.id) ? "ring-2 ring-black" : ""
                      }`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a")) return;
                        toggleSelect(exp.id);
                      }}>
                      {/* 选中框 */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selected.has(exp.id) ? "bg-black border-black" : "border-gray-300"
                      }`}>
                        {selected.has(exp.id) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>

                      {/* 内容区 */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/trips/${id}/expenses/${exp.id}`} className="block">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${exp.type === "shared" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
                              {exp.type === "shared" ? "公" : "私"}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900 truncate">{exp.description || categoryLabels[exp.category]}</h3>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {exp.type === "shared" && exp.payer_nickname ? `付款人：${exp.payer_nickname}` : exp.creator_nickname}
                          </p>
                        </Link>
                      </div>

                      {/* 金额列 */}
                      <div className="flex gap-4 text-right flex-shrink-0">
                        <div>
                          <p className="text-[10px] text-gray-400">总支出</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(exp.amount, exp.currency)}</p>
                          <p className="text-[10px] text-gray-400">{formatCurrency(exp.base_amount, trip?.base_currency || "CNY")}</p>
                        </div>
                        <div className="w-16">
                          <p className="text-[10px] text-gray-400">用户支出</p>
                          {exp.type === "shared" ? (
                            myShare != null && myShare > 0 ? (
                              <>
                                <p className="text-sm font-semibold text-orange-500">
                                  {exp.currency !== trip?.base_currency
                                    ? formatCurrency(myShare / (exp.exchange_rate || 1), exp.currency)
                                    : formatCurrency(myShare, trip?.base_currency || "CNY")}
                                </p>
                                <p className="text-[10px] text-gray-400">{formatCurrency(myShare, trip?.base_currency || "CNY")}</p>
                              </>
                            ) : (
                              <p className="text-sm font-semibold text-gray-300">0</p>
                            )
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-orange-500">{formatCurrency(exp.amount, exp.currency)}</p>
                              <p className="text-[10px] text-gray-400">{formatCurrency(exp.base_amount, trip?.base_currency || "CNY")}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-20 right-5 z-20">
        <Link href={`/trips/${id}/expenses/new`} className="w-14 h-14 bg-black rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </Link>
      </div>
    </div>
  );
}
