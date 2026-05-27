-- 删除 shared_must_have_settlement_mode CHECK 约束
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS shared_must_have_settlement_mode;
