import type { BalanceItem, DebtEdge } from "@/types";

/**
 * 结算算法（Splitwise 风格债务简化）
 *
 * 输入 trip 下所有 shared expenses + participants，
 * 输出最简转账路径。
 *
 * 算法：
 * 1. 计算每个成员的净余额（paid - owed）
 * 2. 分离 creditors（正余额）和 debtors（负余额）
 * 3. 贪心匹配，每次让最大 debtor 转账给最大 creditor
 * 4. 金额 = min(|debt|, |credit|)，减少交易次数
 */

export function computeBalances(
  expenses: {
    payer_id: string;
    payer_nickname: string;
    participants: { profile_id: string; nickname: string; share_amount: number }[];
    base_amount: number;
  }[]
): BalanceItem[] {
  const balanceMap = new Map<string, BalanceItem>();

  for (const exp of expenses) {
    // payer 垫付
    if (!balanceMap.has(exp.payer_id)) {
      balanceMap.set(exp.payer_id, {
        profile_id: exp.payer_id,
        nickname: exp.payer_nickname,
        total_paid: 0,
        total_owed: 0,
        balance: 0,
      });
    }
    const payer = balanceMap.get(exp.payer_id)!;
    payer.total_paid += exp.base_amount;

    // 参与者应承担
    for (const p of exp.participants) {
      if (!balanceMap.has(p.profile_id)) {
        balanceMap.set(p.profile_id, {
          profile_id: p.profile_id,
          nickname: p.nickname,
          total_paid: 0,
          total_owed: 0,
          balance: 0,
        });
      }
      const entry = balanceMap.get(p.profile_id)!;
      entry.total_owed += p.share_amount;
    }
  }

  // 计算净余额
  for (const [, item] of balanceMap) {
    item.balance = item.total_paid - item.total_owed;
  }

  return Array.from(balanceMap.values());
}

export function simplifyDebts(balances: BalanceItem[]): DebtEdge[] {
  const edges: DebtEdge[] = [];

  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, balance: -b.balance })) // 转正方便比较
    .sort((a, b) => b.balance - a.balance);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const transferAmount = Math.min(creditors[ci].balance, debtors[di].balance);

    if (transferAmount > 0.005) {
      edges.push({
        from_profile_id: debtors[di].profile_id,
        from_nickname: debtors[di].nickname,
        to_profile_id: creditors[ci].profile_id,
        to_nickname: creditors[ci].nickname,
        amount: Math.round(transferAmount * 100) / 100,
      });
    }

    creditors[ci].balance -= transferAmount;
    debtors[di].balance -= transferAmount;

    if (creditors[ci].balance < 0.005) ci++;
    if (debtors[di].balance < 0.005) di++;
  }

  return edges;
}
