// ============================================================
// 核心类型定义 — 与数据库严格对应
// ============================================================

// ---------- 枚举 ----------

export type ExpenseType = "personal" | "shared";
export type VisibilityType = "private" | "trip_visible";
export type SettlementMode = "immediate" | "end_of_trip";
export type SplitType = "equal" | "custom" | "percentage";
export type TripStatus = "active" | "completed";
export type MemberRole = "creator" | "member";

export const CURRENCIES = [
  "CNY", // 人民币
  "JPY", // 日元
  "KRW", // 韩元
  "USD", // 美元
  "EUR", // 欧元
  "GBP", // 英镑
  "MYR", // 马来西亚林吉特
  "THB", // 泰铢
  "VND", // 越南盾
  "SGD", // 新加坡元
  "IDR", // 印尼盾
  "AUD", // 澳元
  "CAD", // 加元
  "HKD", // 港币
  "TWD", // 新台币
  "CHF", // 瑞士法郎
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  CNY: "人民币 CNY",
  JPY: "日元 JPY",
  KRW: "韩元 KRW",
  USD: "美元 USD",
  EUR: "欧元 EUR",
  GBP: "英镑 GBP",
  MYR: "马来西亚林吉特 MYR",
  THB: "泰铢 THB",
  VND: "越南盾 VND",
  SGD: "新加坡元 SGD",
  IDR: "印尼盾 IDR",
  AUD: "澳元 AUD",
  CAD: "加元 CAD",
  HKD: "港币 HKD",
  TWD: "新台币 TWD",
  CHF: "瑞士法郎 CHF",
};

export const CATEGORIES = [
  "food",
  "transport",
  "hotel",
  "shopping",
  "entertainment",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

// ---------- 数据表行类型 ----------

export interface Profile {
  id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  name: string;
  description: string;
  base_currency: string;
  currencies: string[];
  creator_id: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  profile_id: string;
  role: MemberRole;
  joined_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  creator_id: string;
  type: ExpenseType;
  visibility: VisibilityType;
  amount: number;
  currency: string;
  exchange_rate: number;
  base_amount: number;
  category: Category;
  description: string;
  expense_date: string;
  payer_id: string | null;
  split_type: SplitType | null;
  settlement_mode: SettlementMode | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseParticipant {
  id: string;
  expense_id: string;
  profile_id: string;
  share_amount: number;
}

export interface Settlement {
  id: string;
  trip_id: string;
  from_profile_id: string;
  to_profile_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  base_amount: number;
  settled_at: string;
  created_at: string;
}

// ---------- 关联查询类型 ----------

/** trips JOIN trip_members */
export interface TripWithRole extends Trip {
  role: MemberRole;
}

/** expenses JOIN profiles (creator) */
export interface ExpenseWithCreator extends Expense {
  creator_nickname: string;
}

/** expenses + creator + participants */
export interface ExpenseFull extends ExpenseWithCreator {
  payer_nickname?: string;
  participants: (ExpenseParticipant & { nickname: string })[];
}

/** trip_members JOIN profiles */
export interface TripMemberWithProfile extends TripMember {
  nickname: string;
}

// ---------- 结算算法类型 ----------

export interface BalanceItem {
  profile_id: string;
  nickname: string;
  total_paid: number;
  total_owed: number;
  balance: number;
}

export interface DebtEdge {
  from_profile_id: string;
  from_nickname: string;
  to_profile_id: string;
  to_nickname: string;
  amount: number;
}

// ---------- 表单类型 ----------

export interface LoginForm {
  nickname: string;
  password: string;
}

export interface CreateTripForm {
  name: string;
  description?: string;
  base_currency: string;
}

export interface ExpenseForm {
  type: ExpenseType;
  visibility: VisibilityType;
  amount: number;
  currency: string;
  exchange_rate: number;
  category: Category;
  description: string;
  expense_date: string;
  // shared only
  payer_id?: string;
  split_type?: SplitType;
  settlement_mode?: SettlementMode | null;
  participants?: { profile_id: string; share_amount: number }[];
}

export interface SettlementForm {
  trip_id: string;
  to_profile_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
}

// ---------- API 响应类型 ----------

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}
