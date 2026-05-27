"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTripsStore } from "@/stores/trips";
import { supabase } from "@/lib/supabase";
import { CURRENCIES, CURRENCY_LABELS } from "@/types";

const tripSchema = z.object({
  name: z.string().min(1, "请输入旅行名称").max(50),
  description: z.string().max(200).optional(),
  base_currency: z.string(),
});

type TripValues = z.infer<typeof tripSchema>;

export default function NewTripPage() {
  const router = useRouter();
  const { createTrip } = useTripsStore();
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBasePicker, setShowBasePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const {
    register, handleSubmit, setValue, watch, formState: { errors },
  } = useForm<TripValues>({ resolver: zodResolver(tripSchema), defaultValues: { base_currency: "CNY" } });

  const baseCurrency = watch("base_currency");
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(["CNY"]);

  const toggleCurrency = (code: string) => {
    setSelectedCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const onSubmit = async (values: TripValues) => {
    setServerError("");
    setLoading(true);

    // 检查重名
    const { data: existing } = await supabase.from("trips").select("id").eq("name", values.name).limit(1);
    if (existing && existing.length > 0) {
      setServerError("旅行名称已存在，请换一个名字");
      setLoading(false);
      return;
    }

    const currencies = [...new Set([values.base_currency, ...selectedCurrencies])];
    const result = await createTrip(values.name, values.description ?? "", values.base_currency);
    if (result.error) { setServerError(result.error); setLoading(false); return; }
    await supabase.from("trips").update({ currencies }).eq("id", result.id!);
    router.push(`/trips/${result.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center text-gray-500 -ml-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">创建旅行</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pt-4 space-y-4">
        {/* Name */}
        <div className="bg-white rounded-2xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">旅行名称</label>
          <input {...register("name")} placeholder="例如：北海道旅行" className="w-full h-11 bg-transparent text-base placeholder:text-gray-300 focus:outline-none" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">描述 <span className="text-gray-300 font-normal">选填</span></label>
          <input {...register("description")} placeholder="简要描述" className="w-full h-11 bg-transparent text-base placeholder:text-gray-300 focus:outline-none" />
        </div>

        {/* Base Currency */}
        <div className="bg-white rounded-2xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">基准货币</label>
          <button type="button" onClick={() => setShowBasePicker(!showBasePicker)} className="w-full h-11 flex items-center justify-between text-gray-900">
            <span>{CURRENCY_LABELS[baseCurrency]}</span>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${showBasePicker ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showBasePicker && (
            <div className="mt-2 pt-2 border-t border-gray-100 max-h-60 overflow-y-auto">
              {CURRENCIES.map((code) => (
                <label key={code} className={`flex items-center gap-3 py-2.5 cursor-pointer ${baseCurrency === code ? "text-black" : "text-gray-500"}`}
                  onClick={() => { setValue("base_currency", code); setShowBasePicker(false); }}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${baseCurrency === code ? "border-black" : "border-gray-300"}`}>
                    {baseCurrency === code && <div className="w-2.5 h-2.5 bg-black rounded-full" />}
                  </div>
                  <span className="text-sm">{CURRENCY_LABELS[code]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 旅行使用的货币 */}
        <div className="bg-white rounded-2xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">本次旅行使用的货币（可多选）</label>
          <button type="button" onClick={() => setShowCurrencyPicker(!showCurrencyPicker)} className="w-full h-11 flex items-center justify-between text-gray-900">
            <span className="text-sm text-gray-500 truncate">
              {selectedCurrencies.length === 0 ? "请选择" : selectedCurrencies.map((c) => CURRENCY_LABELS[c]).join("、")}
            </span>
            <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${showCurrencyPicker ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showCurrencyPicker && (
            <div className="mt-2 pt-2 border-t border-gray-100 max-h-60 overflow-y-auto space-y-1">
              {CURRENCIES.map((code) => (
                <label key={code} className="flex items-center gap-3 py-2 cursor-pointer" onClick={() => toggleCurrency(code)}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedCurrencies.includes(code) ? "bg-black border-black" : "border-gray-300"}`}>
                    {selectedCurrencies.includes(code) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm">{CURRENCY_LABELS[code]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {serverError && <div className="bg-red-50 rounded-xl px-4 py-3"><p className="text-red-600 text-sm">{serverError}</p></div>}

        <button type="submit" disabled={loading} className="w-full h-12 bg-black text-white rounded-xl text-base font-semibold active:scale-[0.98] transition-all disabled:opacity-50">
          {loading ? "创建中..." : "创建旅行"}
        </button>
      </form>
    </div>
  );
}
