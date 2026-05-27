"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { CURRENCY_LABELS } from "@/types";
import type { ExpenseFull, Trip, TripMemberWithProfile, SplitType } from "@/types";

const categoryLabels: Record<string, string> = {
  food: "餐饮", transport: "交通", hotel: "酒店", shopping: "购物", entertainment: "娱乐", other: "其他",
};

export default function ExpenseDetailPage() {
  const { id: tripId, expenseId } = useParams<{ id: string; expenseId: string }>();
  const router = useRouter();
  const [expense, setExpense] = useState<ExpenseFull | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allMembers, setAllMembers] = useState<TripMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [myUserId, setMyUserId] = useState("");

  const [editPayerId, setEditPayerId] = useState("");
  const [editSplitType, setEditSplitType] = useState<SplitType>("equal");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState(0);
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [editCustomAmounts, setEditCustomAmounts] = useState<Record<string, number>>({});
  const [editPercentages, setEditPercentages] = useState<Record<string, number>>({});

  const canEdit = expense && trip && allMembers.some((m) => m.profile_id === myUserId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setMyUserId(user.id); });
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data }) => { if (data) setTrip(data as Trip); });
    supabase.rpc("get_trip_members", { p_trip_id: tripId }).then(({ data, error }) => {
      if (!error && data) setAllMembers((data as any[]).map((r) => ({
        id: r.member_id, trip_id: r.member_trip_id, profile_id: r.member_profile_id,
        role: r.member_role, joined_at: r.member_joined_at, nickname: r.member_nickname ?? "",
      })));
    });
    fetchExpense();
  }, [tripId, expenseId]);

  async function fetchExpense() {
    const { data } = await supabase.from("expenses")
      .select("*, creator:creator_id(nickname), payer:payer_id(nickname)")
      .eq("id", expenseId).single();
    if (!data) { setLoading(false); return; }
    const e = data as any;
    let participants: any[] = [];
    const pidSet = new Set<string>();
    const customMap: Record<string, number> = {};
    if (e.type === "shared") {
      const { data: parts } = await supabase.from("expense_participants")
        .select("*, profiles(nickname)").eq("expense_id", e.id);
      participants = (parts || []).map((p: any) => {
        pidSet.add(p.profile_id);
        // 转回原币种用于编辑
        const foreignAmount = p.share_amount / (e.exchange_rate || 1);
        customMap[p.profile_id] = Math.round(foreignAmount * 100) / 100;
        return { id: p.id, expense_id: p.expense_id, profile_id: p.profile_id, share_amount: p.share_amount, nickname: p.profiles?.nickname ?? "" };
      });
    }
    setExpense({ ...e, creator_nickname: e.creator?.nickname ?? "", payer_nickname: e.payer?.nickname ?? "", participants });
    setEditDescription(e.description);
    setEditAmount(e.amount);
    setEditCategory(e.category);
    setEditDate(e.expense_date);
    setEditPayerId(e.payer_id || "");
    setEditSplitType((e.split_type as SplitType) || "equal");
    setSelectedPids(pidSet);
    setEditCustomAmounts(customMap);
    setLoading(false);
  }

  const selArr = Array.from(selectedPids);
  const exchangeRate = expense?.exchange_rate || 1;

  function toggleParticipant(pid: string) {
    setSelectedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        setEditCustomAmounts((a) => { const n = { ...a }; delete n[pid]; return n; });
        setEditPercentages((p) => { const n = { ...p }; delete n[pid]; return n; });
      } else {
        next.add(pid);
      }
      return next;
    });
  }

  // 实时自动补全（用原币种）
  const autoCompleting = useRef(false);
  useEffect(() => {
    if (!editing || selArr.length < 2 || autoCompleting.current) return;
    if (editSplitType === "equal") {
      const share = Math.round((editAmount / selArr.length) * 100) / 100;
      autoCompleting.current = true;
      const map: Record<string, number> = {};
      selArr.forEach((p) => { map[p] = share; });
      setEditCustomAmounts(map);
      setTimeout(() => { autoCompleting.current = false; }, 0);
      return;
    }
    if (editSplitType === "custom") {
      const filled = selArr.filter((p) => (editCustomAmounts[p] || 0) > 0);
      if (filled.length === selArr.length - 1) {
        autoCompleting.current = true;
        const sum = filled.reduce((s, p) => s + (editCustomAmounts[p] || 0), 0);
        const missing = selArr.find((p) => !filled.includes(p))!;
        setEditCustomAmounts((prev) => ({ ...prev, [missing]: Math.round((editAmount - sum) * 100) / 100 }));
        setTimeout(() => { autoCompleting.current = false; }, 0);
      }
    } else if (editSplitType === "percentage") {
      const filled = selArr.filter((p) => (editPercentages[p] || 0) > 0);
      if (filled.length === selArr.length - 1) {
        autoCompleting.current = true;
        const sumPct = filled.reduce((s, p) => s + (editPercentages[p] || 0), 0);
        const missing = selArr.find((p) => !filled.includes(p))!;
        setEditPercentages((prev) => ({ ...prev, [missing]: 100 - sumPct }));
        setTimeout(() => { autoCompleting.current = false; }, 0);
      }
    }
  }, [editCustomAmounts, editPercentages, editSplitType, selArr.length, editing]);

  async function handleSave() {
    if (!expense || !trip) return;
    setSaving(true);
    try {
      const newBase = expense.currency === trip.base_currency
        ? editAmount : Math.round(editAmount * exchangeRate * 100) / 100;

      const selList = Array.from(selectedPids);
      let finalAmountsBase: Record<string, number> = {};

      if (expense.type === "shared" && selList.length > 0) {
        if (editSplitType === "equal") {
          const share = Math.round((newBase / selList.length) * 100) / 100;
          selList.forEach((p) => { finalAmountsBase[p] = share; });
        } else if (editSplitType === "percentage") {
          selList.forEach((p) => {
            finalAmountsBase[p] = Math.round((newBase * (editPercentages[p] || 0) / 100) * 100) / 100;
          });
        } else {
          selList.forEach((p) => {
            finalAmountsBase[p] = Math.round((editCustomAmounts[p] || 0) * exchangeRate * 100) / 100;
          });
        }
      }

      const { error: updErr } = await supabase.from("expenses").update({
        description: editDescription, amount: editAmount, base_amount: newBase,
        category: editCategory, expense_date: editDate,
        payer_id: expense.type === "shared" ? editPayerId : null,
        split_type: expense.type === "shared" ? editSplitType : null,
        updated_at: new Date().toISOString(),
      }).eq("id", expenseId);

      if (updErr) { console.error("Update error:", updErr); alert("更新失败: " + updErr.message); setSaving(false); return; }

      if (expense.type === "shared") {
        const { error: delErr } = await supabase.from("expense_participants").delete().eq("expense_id", expenseId);
        if (delErr) console.error("Delete parts error:", delErr);

        if (selList.length > 0) {
          const rows = selList.map((pid) => ({ expense_id: expenseId, profile_id: pid, share_amount: finalAmountsBase[pid] || 0 }));
          console.log("Inserting participants:", rows);
          const { error: insErr } = await supabase.from("expense_participants").insert(rows);
          if (insErr) { console.error("Insert parts error:", insErr); alert("更新参与人失败: " + insErr.message); setSaving(false); return; }
        }
      }

      setEditing(false);
      setSaving(false);
      await fetchExpense();
    } catch (err) {
      console.error("Save failed:", err);
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">加载中...</p></div>;
  if (!expense) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">消费不存在</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-base text-gray-500 flex items-center gap-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>返回
          </button>
          {canEdit && (
            <button onClick={() => setEditing(!editing)} className="text-sm text-blue-600 font-medium">{editing ? "取消编辑" : "编辑"}</button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {editing ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <div><label className="text-xs text-gray-400">描述</label><input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full h-11 text-base focus:outline-none mt-1" /></div>
              <div><label className="text-xs text-gray-400">金额 ({expense.currency})</label><input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)} className="w-full h-11 text-base focus:outline-none mt-1" /></div>
              <div><label className="text-xs text-gray-400">分类</label><select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full h-11 text-base bg-transparent focus:outline-none mt-1">{Object.entries(categoryLabels).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}</select></div>
              <div><label className="text-xs text-gray-400">日期</label><input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full h-11 text-base focus:outline-none mt-1" /></div>
            </div>

            {expense.type === "shared" && (
              <div className="bg-white rounded-2xl p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400">付款人</label>
                  <select value={editPayerId} onChange={(e) => setEditPayerId(e.target.value)}
                    className="w-full h-11 mt-1 bg-gray-50 rounded-xl px-3 text-sm focus:outline-none">
                    {allMembers.map((m) => (<option key={m.profile_id} value={m.profile_id}>{m.nickname}</option>))}
                  </select>
                </div>
                <label className="text-xs text-gray-400">分账方式</label>
                <div className="flex gap-2">
                  {(["equal", "custom", "percentage"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setEditSplitType(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium ${editSplitType === s ? "bg-black text-white" : "bg-gray-50 text-gray-500"}`}>
                      {s === "equal" ? "均分" : s === "percentage" ? "按比例" : "固定金额"}
                    </button>
                  ))}
                </div>

                {/* 修改参与人员 */}
                <label className="text-xs text-gray-400 pt-1 block">参与人员（点击增减）</label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {allMembers.map((m) => {
                    const isSelected = selectedPids.has(m.profile_id);
                    const share = editCustomAmounts[m.profile_id];
                    const pct = editPercentages[m.profile_id];
                    return (
                    <div key={m.profile_id} className="flex items-center gap-2 py-1.5">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleParticipant(m.profile_id)} className="w-4 h-4 accent-black" />
                      <span className="flex-1 text-sm">{m.nickname}{m.profile_id === myUserId ? "（我）" : ""}</span>
                      {isSelected && editSplitType === "custom" && (
                        <input type="number" step="0.01" value={share || ""}
                          onChange={(e) => setEditCustomAmounts((prev) => ({ ...prev, [m.profile_id]: parseFloat(e.target.value) || 0 }))}
                          className="w-24 h-8 text-right text-sm bg-gray-50 rounded-lg px-2 focus:outline-none" />
                      )}
                      {isSelected && editSplitType === "percentage" && (
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" max="100" value={pct || 0}
                            onChange={(e) => setEditPercentages((prev) => ({ ...prev, [m.profile_id]: parseInt(e.target.value) || 0 }))}
                            className="w-16 h-8 text-right text-sm bg-gray-50 rounded-lg px-2 focus:outline-none" /><span className="text-xs text-gray-400">%</span>
                        </div>
                      )}
                      {isSelected && editSplitType === "equal" && (
                        <span className="text-xs text-gray-400">{expense ? formatCurrency(editAmount / selArr.length, expense.currency) : ""}</span>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} className="w-full h-12 bg-black text-white rounded-xl font-semibold">{saving ? "保存中..." : "保存修改"}</button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-1 rounded-full ${expense.type === "shared" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>{expense.type === "shared" ? "公共消费" : "个人消费"}</span>
                <span className="text-xs text-gray-400">{expense.expense_date}</span>
              </div>
              <h2 className="text-lg font-bold">{expense.description || categoryLabels[expense.category]}</h2>
              <p className="text-2xl font-bold mt-2">{formatCurrency(expense.amount, expense.currency)}</p>
              {expense.currency !== trip?.base_currency && (
                <p className="text-sm text-gray-400 mt-1">≈ {formatCurrency(expense.base_amount, trip?.base_currency || "CNY")}（汇率 {expense.exchange_rate}）</p>
              )}
            </div>
            <div className="bg-white rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">分类</span><span>{categoryLabels[expense.category]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">币种</span><span>{CURRENCY_LABELS[expense.currency] || expense.currency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">创建者</span><span>{expense.creator_nickname}</span></div>
              {expense.type === "shared" && expense.payer_nickname && (
                <div className="flex justify-between"><span className="text-gray-500">付款人</span><span>{expense.payer_nickname}</span></div>
              )}
              {expense.type === "shared" && (
                <div className="flex justify-between"><span className="text-gray-500">分账</span><span>{expense.split_type === "equal" ? "平均分摊" : expense.split_type === "percentage" ? "按比例" : "固定金额"}</span></div>
              )}
            </div>
            {expense.type === "shared" && expense.participants.length > 0 && (
              <div className="bg-white rounded-2xl p-4">
                <h3 className="text-sm font-semibold mb-3">参与人及分摊金额</h3>
                {expense.participants.map((p) => {
                  const foreignShare = expense.currency !== (trip?.base_currency || "CNY")
                    ? p.share_amount / (expense.exchange_rate || 1)
                    : p.share_amount;
                  return (
                  <div key={p.id} className="flex justify-between py-1.5 text-sm">
                    <span>{p.nickname}{p.profile_id === myUserId ? "（我）" : ""}</span>
                    <div className="text-right">
                      <span className="font-semibold">{formatCurrency(foreignShare, expense.currency)}</span>
                      {expense.currency !== (trip?.base_currency || "CNY") && (
                        <p className="text-[10px] text-gray-400">{formatCurrency(p.share_amount, trip?.base_currency || "CNY")}</p>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
