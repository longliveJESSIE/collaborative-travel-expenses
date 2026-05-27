"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getExchangeRate } from "@/lib/exchange-rate";
import { CURRENCIES, CURRENCY_LABELS } from "@/types";
import type { Trip, TripMemberWithProfile } from "@/types";

export default function InfoPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [searchNickname, setSearchNickname] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; nickname: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingCurrencies, setEditingCurrencies] = useState(false);
  const [tripCurrencies, setTripCurrencies] = useState<string[]>([]);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [ratesTime, setRatesTime] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isCreator = trip?.creator_id === myUserId;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setMyUserId(user.id); });
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data }) => {
      if (data) {
        const t = data as Trip;
        setTrip(t);
        setTripCurrencies(t.currencies || ["CNY"]);
      }
    });
    fetchMembers();
  }, [tripId]);

  async function fetchRates() {
    if (!trip) return;
    const rates: Record<string, number> = {};
    for (const c of tripCurrencies) {
      if (c === trip.base_currency) { rates[c] = 1; continue; }
      rates[c] = await getExchangeRate(c, trip.base_currency);
    }
    setLiveRates(rates);
    setRatesTime(new Date().toLocaleTimeString("zh-CN"));
  }

  useEffect(() => { if (trip) fetchRates(); }, [trip, tripCurrencies]);

  async function handleRefreshRates() {
    if (!trip) return;
    setRefreshing(true);
    // 直接获取最新汇率，不用 state
    const newRates: Record<string, number> = {};
    for (const c of tripCurrencies) {
      if (c === trip.base_currency) { newRates[c] = 1; continue; }
      newRates[c] = await getExchangeRate(c, trip.base_currency);
    }
    setLiveRates(newRates);
    setRatesTime(new Date().toLocaleTimeString("zh-CN"));

    const ratesForRpc: Record<string, number> = {};
    for (const [c, r] of Object.entries(newRates)) {
      if (c !== trip.base_currency) ratesForRpc[c] = r;
    }

    if (!confirm("将使用新汇率更新所有消费金额，确认？")) { setRefreshing(false); return; }
    const { error } = await supabase.rpc("refresh_trip_rates", {
      p_trip_id: tripId, p_rates: ratesForRpc,
    });
    setRefreshing(false);
    if (error) alert("更新失败: " + error.message);
    else alert("汇率已更新，所有消费金额已同步");
  }

  function fetchMembers() {
    supabase.rpc("get_trip_members", { p_trip_id: tripId }).then(({ data, error }) => {
      if (!error && data) {
        setMembers((data as any[]).map((r) => ({
          id: r.member_id, trip_id: r.member_trip_id, profile_id: r.member_profile_id,
          role: r.member_role, joined_at: r.member_joined_at, nickname: r.member_nickname ?? "",
        })));
      }
      setLoading(false);
    });
  }

  async function toggleCurrency(code: string) {
    const next = tripCurrencies.includes(code)
      ? tripCurrencies.filter((c) => c !== code && c !== trip?.base_currency)
      : [...tripCurrencies, code];
    // 基准货币不可移除
    if (code === trip?.base_currency) return;
    setTripCurrencies(next);
    await supabase.from("trips").update({ currencies: next }).eq("id", tripId);
  }

  async function searchUsers() {
    if (!searchNickname.trim()) return;
    const { data } = await supabase.from("profiles").select("id, nickname").ilike("nickname", `%${searchNickname}%`).limit(10);
    if (data) {
      const existingIds = new Set(members.map((m) => m.profile_id));
      setSearchResults(data.filter((p) => !existingIds.has(p.id)));
    }
  }

  async function addMember(profileId: string) {
    setAdding(true);
    const { error } = await supabase.rpc("add_trip_member", { p_trip_id: tripId, p_profile_id: profileId });
    setAdding(false);
    if (error) { alert(error.message); return; }
    setShowAdd(false); setSearchNickname(""); setSearchResults([]);
    fetchMembers();
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">加载中...</p></div>;

  const sorted = [...members].sort((a, b) => a.role === "creator" ? -1 : b.role === "creator" ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/trips")} className="text-base text-gray-500 flex items-center gap-1 mr-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">信息</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 货币设置 */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">旅行货币</h2>
            <div className="flex items-center gap-2">
              {isCreator && (
                <button onClick={handleRefreshRates} disabled={refreshing} className="text-xs text-blue-600">
                  {refreshing ? "更新中..." : "刷新汇率"}
                </button>
              )}
              {isCreator && (
                <button onClick={() => setEditingCurrencies(!editingCurrencies)} className="text-xs text-gray-400">
                  {editingCurrencies ? "完成" : "编辑"}
                </button>
              )}
            </div>
          </div>
          {ratesTime && (
            <p className="text-[10px] text-gray-400 mb-2">
              汇率来源 frankfurter.app · {ratesTime}
            </p>
          )}
          {editingCurrencies ? (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {CURRENCIES.map((code) => {
                const isBase = code === trip?.base_currency;
                return (
                  <label key={code} className={`flex items-center gap-3 py-2 cursor-pointer ${isBase ? "opacity-60" : ""}`}
                    onClick={() => !isBase && toggleCurrency(code)}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${tripCurrencies.includes(code) ? "bg-black border-black" : "border-gray-300"}`}>
                      {tripCurrencies.includes(code) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <span className="text-sm">{CURRENCY_LABELS[code]}{isBase ? "（基准）" : ""}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {tripCurrencies.map((code) => (
                <div key={code} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{CURRENCY_LABELS[code]}{code === trip?.base_currency ? "（基准）" : ""}</span>
                  {code !== trip?.base_currency && liveRates[code] && (
                    <span className="text-gray-400">1 {code} = {liveRates[code].toFixed(4)} {trip?.base_currency}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 成员 */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">成员 · {members.length}</h2>
            {isCreator && (
              <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-blue-600">{showAdd ? "取消" : "添加"}</button>
            )}
          </div>
          {showAdd && (
            <div className="mb-3 space-y-2">
              <div className="flex gap-2">
                <input type="text" value={searchNickname} onChange={(e) => setSearchNickname(e.target.value)}
                  placeholder="搜索昵称..." className="flex-1 h-10 bg-gray-50 rounded-xl px-3 text-sm focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()} />
                <button onClick={searchUsers} className="h-10 px-4 bg-black text-white text-sm rounded-xl">搜索</button>
              </div>
              {searchResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1">
                  <span className="text-sm">{p.nickname}</span>
                  <button onClick={() => addMember(p.id)} disabled={adding} className="text-sm text-blue-600">添加</button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {sorted.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{m.nickname[0]?.toUpperCase()}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{m.nickname}{m.profile_id === myUserId && <span className="text-gray-300 ml-1">(我)</span>}</p>
                  <p className="text-xs text-gray-400">{m.role === "creator" ? "创建者" : "成员"}</p>
                </div>
                {isCreator && m.profile_id !== myUserId && (
                  <button onClick={async () => { await supabase.rpc("remove_trip_member", { p_trip_id: tripId, p_profile_id: m.profile_id }); fetchMembers(); }}
                    className="text-xs text-red-400">移除</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
