import type { CurrencyCode } from "@/types";

/** 格式化金额为币种显示 */
export function formatCurrency(
  amount: number,
  currency: string
): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** 生成 fake email: nickname@travelapp.example.com */
export function generateFakeEmail(nickname: string): string {
  const sanitized = nickname.trim().toLowerCase().replace(/\s+/g, ".");
  return `${sanitized}@travelapp.example.com`;
}

/** 是否为有效的 nickname */
export function isValidNickname(nickname: string): boolean {
  return /^[a-zA-Z0-9_一-鿿]{2,20}$/.test(nickname);
}

/** 获取货币符号 */
export function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    CNY: "¥",
    JPY: "¥",
    USD: "$",
    EUR: "€",
  };
  return map[currency] ?? currency;
}

/** 日期格式化 YYYY-MM-DD */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
