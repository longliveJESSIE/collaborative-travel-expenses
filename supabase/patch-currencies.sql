-- 给 trips 添加 currencies 数组列
ALTER TABLE trips ADD COLUMN IF NOT EXISTS currencies TEXT[] DEFAULT '{CNY}';

-- 移除 expenses 的 settlement_mode NOT NULL 约束（结算模式改为在结算页选）
ALTER TABLE expenses ALTER COLUMN settlement_mode DROP NOT NULL;
