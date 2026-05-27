import type { CurrencyCode } from "@/types";

/**
 * 汇率模块
 * - 优先使用 frankfurter.app API
 * - 失败时使用内置近似汇率（离线可用）
 * - 消费创建时保存汇率快照
 */

const API_BASE = "https://api.frankfurter.app";

const cache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 小时

// 内置近似汇率 (相对于 CNY，2026 年参考值)
const STATIC_RATES: Record<string, number> = {
  CNY: 1,
  JPY: 21.5,
  KRW: 190.5,
  USD: 0.138,
  EUR: 0.127,
  GBP: 0.109,
  MYR: 0.62,
  THB: 4.8,
  VND: 3500,
  SGD: 0.185,
  IDR: 2200,
  AUD: 0.21,
  CAD: 0.189,
  HKD: 1.08,
  TWD: 4.45,
  CHF: 0.123,
};

function staticRate(from: string, to: string): number {
  if (from === to) return 1;
  const fromRate = STATIC_RATES[from];
  const toRate = STATIC_RATES[to];
  if (fromRate && toRate) return toRate / fromRate;
  return 1;
}

export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `${from}-${to}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.rate;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/latest?from=${from}&to=${to}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const rate = data.rates[to] as number;

    cache.set(cacheKey, { rate, timestamp: Date.now() });
    return rate;
  } catch {
    // 在线 API 不可用时，使用静态汇率
    const rate = staticRate(from, to);
    cache.set(cacheKey, { rate, timestamp: Date.now() });
    return rate;
  }
}

export async function convertAmount(amount: number, from: string, to: string) {
  const rate = await getExchangeRate(from, to);
  return { baseAmount: Math.round(amount * rate * 100) / 100, rate };
}

export function getRateSnapshot(existingRate?: number): number {
  return existingRate ?? 1.0;
}
