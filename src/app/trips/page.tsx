"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { computeBalances, simplifyDebts } from "@/lib/settlement";
import type { DebtEdge } from "@/types";

interface JoinableTrip {
  id: string; name: string; description: string; base_currency: string; member_count: number;
}

interface TripStats {
  personalTotal: number;
  sharedPaid: number;
  sharedOwed: number;
  hasUnsettled: boolean;
  debts: DebtEdge[];
}

export default function TripsPage() {
  const router = useRouter();
  const { user, profile, fetchProfile, signOut } = useAuthStore();
  const { trips, loading, fetchTrips } = useTripsStore();
  const [initialized, setInitialized] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<JoinableTrip[]>([]);
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [tripStats, setTripStats] = useState<Record<string, TripStats>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.replace("/login"); return; }
      useAuthStore.setState({ user: { id: session.user.id, email: session.user.email! } });
      fetchProfile(session.user.id);
      fetchTrips().then(() => setInitialized(true));
    });
  }, [router, fetchProfile, fetchTrips]);

  // 加载每个旅行的统计数据
  useEffect(() => {
    if (!user) return;
    if (trips.length === 0) { setTripStats({}); return; }
    trips.forEach(async (trip) => {
      const { data: expenses } = await supabase.from("expenses")
        .select("*").eq("trip_id", trip.id);
      if (!expenses) return;

      let personalTotal = 0, sharedPaid = 0, sharedOwed = 0;
      const sharedExpenses: any[] = [];

      for (const e of expenses as any[]) {
        if (e.type === "personal") {
          personalTotal += e.base_amount;
        } else {
          sharedExpenses.push(e);
          if (e.payer_id === user.id) sharedPaid += e.base_amount;
        }
      }

      let hasUnsettled = false;
      if (sharedExpenses.length > 0) {
        const fullShared = await Promise.all(sharedExpenses.map(async (e: any) => {
          const { data: parts } = await supabase.from("expense_participants")
            .select("*").eq("expense_id", e.id);
          return { payer_id: e.payer_id, payer_nickname: "", base_amount: e.base_amount,
            participants: (parts || []).map((p: any) => ({
              profile_id: p.profile_id, nickname: "", share_amount: p.share_amount })) };
        }));
        const balances = computeBalances(fullShared);
        const myBalance = balances.find((b) => b.profile_id === user.id);
        sharedOwed = myBalance?.total_owed || 0;
        sharedPaid = myBalance?.total_paid || 0;
        const debts = simplifyDebts(balances);
        hasUnsettled = sharedExpenses.some((e: any) => !e.settled_at);
      }
      setTripStats((prev) => ({ ...prev, [trip.id]: { personalTotal, sharedPaid, sharedOwed, hasUnsettled, debts: [] } }));
    });
  }, [trips, user]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.rpc("search_joinable_trips", { p_query: searchQuery.trim() });
    setSearching(false);
    if (!error && data) setSearchResults(data as JoinableTrip[]);
  }

  // 清理已删除旅行的统计
  const activeStats = Object.fromEntries(
    Object.entries(tripStats).filter(([id]) => trips.some((t) => t.id === id))
  );
  const totalPersonal = Object.values(activeStats).reduce((s, t) => s + t.personalTotal, 0);
  const totalSharedPaid = Object.values(activeStats).reduce((s, t) => s + t.sharedPaid, 0);
  const totalSharedOwed = Object.values(activeStats).reduce((s, t) => s + t.sharedOwed, 0);
  const totalActual = totalPersonal + totalSharedOwed;
  const hasAnyUnsettled = Object.values(activeStats).some((t) => t.hasUnsettled);

  if (!initialized || !user) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">你好，{profile?.nickname ?? "..."}</h1>
            <p className="text-sm text-gray-400 mt-0.5">转我五毛</p>
          </div>
          <button onClick={async () => { await signOut(); router.replace("/login"); }} className="text-sm text-gray-400 hover:text-red-500">退出</button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-24">
        {/* 创建 / 加入 */}
        <div className="flex gap-2 mb-6">
          <Link href="/trips/new" className="flex-1 py-3 bg-black text-white rounded-xl text-sm font-semibold text-center active:scale-[0.98] transition-transform">创建旅行</Link>
          <button onClick={() => { setShowJoin(!showJoin); setSearchResults([]); setSearchQuery(""); }}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold text-center transition-all ${showJoin ? "bg-gray-100 text-gray-500" : "bg-white text-gray-900 border border-gray-200"}`}>
            {showJoin ? "取消" : "加入旅行"}
          </button>
        </div>

        {/* 加入面板 */}
        {showJoin && (
          <div className="bg-white rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex gap-2">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索旅行名称" className="flex-1 h-11 bg-gray-50 rounded-xl px-4 text-sm focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              <button onClick={handleSearch} disabled={searching} className="h-11 px-5 bg-black text-white text-sm rounded-xl">{searching ? "搜索中" : "搜索"}</button>
            </div>
            {searchResults.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2">
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{t.name}</p><p className="text-xs text-gray-400">{t.member_count} 位成员</p></div>
                <button onClick={() => { setJoining(t.id); supabase.rpc("join_trip", { p_trip_id: t.id }).then(() => { setJoining(null); setShowJoin(false); fetchTrips(); }); }}
                  className="ml-3 h-9 px-4 bg-blue-600 text-white text-xs rounded-lg">{joining === t.id ? "..." : "加入"}</button>
              </div>
            ))}
            {searchResults.length === 0 && searchQuery && !searching && <p className="text-gray-400 text-sm text-center py-2">未找到匹配的旅行</p>}
          </div>
        )}

        {/* 我的消费统计 */}
        {(totalPersonal > 0 || totalSharedPaid > 0) && (
          <div className="bg-white rounded-2xl p-4 mb-6">
            <h2 className="text-sm font-medium text-gray-400 mb-3">我的消费</h2>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="bg-orange-50 rounded-xl py-2.5">
                <p className="text-[10px] text-gray-500">总支出</p>
                <p className="text-sm font-bold mt-0.5">{formatCurrency(totalSharedPaid, "CNY")}</p>
              </div>
              <div className={`rounded-xl py-2.5 ${hasAnyUnsettled ? "bg-red-50" : "bg-green-50"}`}>
                <p className="text-[10px] text-gray-500">应结算公共</p>
                <p className="text-sm font-bold mt-0.5">{formatCurrency(totalSharedOwed, "CNY")}</p>
              </div>
              <div className="bg-blue-50 rounded-xl py-2.5">
                <p className="text-[10px] text-gray-500">个人消费</p>
                <p className="text-sm font-bold mt-0.5">{formatCurrency(totalPersonal, "CNY")}</p>
              </div>
              <div className="bg-gray-100 rounded-xl py-2.5">
                <p className="text-[10px] text-gray-500">实际支出</p>
                <p className="text-sm font-bold mt-0.5">{formatCurrency(totalActual, "CNY")}</p>
              </div>
            </div>
          </div>
        )}

        {/* 我的旅行 */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">我的旅行{trips.length > 0 ? ` · ${trips.length}` : ""}</h2>
        {loading ? <p className="text-gray-400 text-center py-10">加载中...</p>
        : trips.length === 0 ? <p className="text-gray-400 text-center py-10 text-sm">还没有加入任何旅行</p>
        : <div className="space-y-2.5">
          {trips.map((trip) => {
            const stats = tripStats[trip.id];
            return (
              <div key={trip.id} className="bg-white rounded-2xl flex items-center active:scale-[0.98] transition-transform overflow-hidden">
                <Link href={`/trips/${trip.id}`} className="flex-1 p-4 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{trip.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{trip.base_currency}</span>
                    {stats && (
                      <span className={`text-[10px] ${stats.hasUnsettled ? "text-orange-500" : "text-green-500"}`}>
                        {stats.hasUnsettled ? "待结算" : "已结清"}
                      </span>
                    )}
                  </div>
                </Link>
                {trip.creator_id === user.id ? (
                  <button onClick={async (e) => {
                    e.preventDefault();
                    if (!confirm(`确定删除「${trip.name}」？此操作不可恢复。`)) return;
                    await supabase.from("trips").delete().eq("id", trip.id);
                    fetchTrips();
                  }} className="px-3 text-xs text-red-400 font-medium">删除</button>
                ) : (
                  <button onClick={async () => {
                    if (!confirm(`确定退出「${trip.name}」？`)) return;
                    await supabase.rpc("remove_trip_member", { p_trip_id: trip.id, p_profile_id: user.id });
                    fetchTrips();
                  }} className="px-4 text-xs text-red-400 font-medium">退出</button>
                )}
              </div>
            );
          })}
        </div>}
      </div>
    </div>
  );
}
