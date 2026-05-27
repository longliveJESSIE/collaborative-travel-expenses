-- ============================================================
-- 旅行 AA 记账工具 — Supabase Schema
-- 在 Supabase SQL Editor 中一次性执行
-- ============================================================

-- ============================================================
-- 1. 枚举类型
-- ============================================================
CREATE TYPE expense_type AS ENUM ('personal', 'shared');
CREATE TYPE visibility_type AS ENUM ('private', 'trip_visible');
CREATE TYPE settlement_mode AS ENUM ('immediate', 'end_of_trip');
CREATE TYPE split_type AS ENUM ('equal', 'custom', 'percentage');

-- ============================================================
-- 2. 核心表
-- ============================================================

-- 2.1 用户档案（关联 Supabase auth.users）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 旅行
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  base_currency TEXT NOT NULL DEFAULT 'CNY',
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 旅行成员
CREATE TABLE trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, profile_id)
);

-- 2.4 消费记录
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 消费类型 & 可见性
  type expense_type NOT NULL,
  visibility visibility_type NOT NULL,

  -- 金额与汇率快照
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  exchange_rate DECIMAL(12, 6) NOT NULL DEFAULT 1.0,
  base_amount DECIMAL(12, 2) NOT NULL,

  -- 分类 & 描述
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- shared 专用字段
  payer_id UUID REFERENCES profiles(id),
  split_type split_type,
  settlement_mode settlement_mode,

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 约束
  CONSTRAINT shared_must_have_payer CHECK (
    type != 'shared' OR payer_id IS NOT NULL
  ),
  CONSTRAINT shared_must_be_trip_visible CHECK (
    type != 'shared' OR visibility = 'trip_visible'
  ),
  CONSTRAINT shared_must_have_split_type CHECK (
    type != 'shared' OR split_type IS NOT NULL
  ),
  CONSTRAINT shared_must_have_settlement_mode CHECK (
    type != 'shared' OR settlement_mode IS NOT NULL
  )
);

-- 2.5 消费参与人（shared 专用）
CREATE TABLE expense_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_amount DECIMAL(12, 2) NOT NULL,
  UNIQUE(expense_id, profile_id)
);

-- 2.6 实际结算记录
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  exchange_rate DECIMAL(12, 6) NOT NULL DEFAULT 1.0,
  base_amount DECIMAL(12, 2) NOT NULL,

  settled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_users CHECK (from_profile_id != to_profile_id)
);

-- ============================================================
-- 3. 索引
-- ============================================================
CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_trip_created ON expenses(trip_id, created_at DESC);
CREATE INDEX idx_expenses_payer ON expenses(trip_id, payer_id);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_expense_participants_profile ON expense_participants(profile_id);
CREATE INDEX idx_settlements_trip ON settlements(trip_id);
CREATE INDEX idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX idx_trip_members_profile ON trip_members(profile_id);

-- ============================================================
-- 4. 自动创建 profile 的触发器
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nickname', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 5. 自动加入 trip creator 为成员
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_trip()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.trip_members (trip_id, profile_id, role)
  VALUES (NEW.id, NEW.creator_id, 'creator');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trip_created ON trips;
CREATE TRIGGER on_trip_created
  AFTER INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_trip();

-- ============================================================
-- 6. RLS 启用
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. profiles RLS
-- ============================================================
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 8. trips RLS
-- ============================================================
CREATE POLICY "trips_select_member" ON trips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = trips.id AND profile_id = auth.uid()
    )
  );

CREATE POLICY "trips_insert_creator" ON trips
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "trips_update_creator" ON trips
  FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "trips_delete_creator" ON trips
  FOR DELETE USING (creator_id = auth.uid());

-- ============================================================
-- 9. trip_members RLS
-- ============================================================
CREATE POLICY "trip_members_select" ON trip_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = trip_members.trip_id AND tm.profile_id = auth.uid()
    )
  );

CREATE POLICY "trip_members_insert_creator" ON trip_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid()
    )
  );

CREATE POLICY "trip_members_delete_creator" ON trip_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid()
    )
  );

-- ============================================================
-- 10. expenses RLS
-- ============================================================

-- 可见规则：
--   private        → 仅 creator 可见
--   trip_visible   → trip 成员可见
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (
    creator_id = auth.uid()
    OR (
      visibility = 'trip_visible'
      AND EXISTS (
        SELECT 1 FROM trip_members
        WHERE trip_id = expenses.trip_id AND profile_id = auth.uid()
      )
    )
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = expenses.trip_id AND profile_id = auth.uid()
    )
  );

CREATE POLICY "expenses_update_creator" ON expenses
  FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "expenses_delete_creator" ON expenses
  FOR DELETE USING (creator_id = auth.uid());

-- ============================================================
-- 11. expense_participants RLS
-- ============================================================

-- 能见父 expense 即可见
CREATE POLICY "expense_parts_select" ON expense_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_participants.expense_id
      AND (
        e.creator_id = auth.uid()
        OR (
          e.visibility = 'trip_visible'
          AND EXISTS (
            SELECT 1 FROM trip_members tm
            WHERE tm.trip_id = e.trip_id AND tm.profile_id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "expense_parts_insert" ON expense_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses WHERE id = expense_id AND creator_id = auth.uid()
    )
  );

CREATE POLICY "expense_parts_update" ON expense_participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM expenses WHERE id = expense_id AND creator_id = auth.uid()
    )
  );

CREATE POLICY "expense_parts_delete" ON expense_participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses WHERE id = expense_id AND creator_id = auth.uid()
    )
  );

-- ============================================================
-- 12. settlements RLS
-- ============================================================
CREATE POLICY "settlements_select" ON settlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = settlements.trip_id AND profile_id = auth.uid()
    )
  );

CREATE POLICY "settlements_insert" ON settlements
  FOR INSERT WITH CHECK (
    from_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = settlements.trip_id AND profile_id = auth.uid()
    )
  );

-- ============================================================
-- 13. 辅助函数：计算 trip 成员净余额
-- 返回每个成员的 (profile_id, paid, owed, balance)
-- ============================================================
CREATE OR REPLACE FUNCTION get_trip_balances(p_trip_id UUID)
RETURNS TABLE (
  profile_id UUID,
  nickname TEXT,
  total_paid DECIMAL(12, 2),
  total_owed DECIMAL(12, 2),
  balance DECIMAL(12, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH
    -- 该 trip 所有 shared 消费
    shared_expenses AS (
      SELECT id, payer_id, base_amount
      FROM expenses
      WHERE trip_id = p_trip_id AND type = 'shared'
    ),
    -- 各成员已垫付金额
    paid AS (
      SELECT se.payer_id AS uid, COALESCE(SUM(se.base_amount), 0) AS paid_amount
      FROM shared_expenses se
      GROUP BY se.payer_id
    ),
    -- 各成员应承担金额
    owed AS (
      SELECT ep.profile_id AS uid, COALESCE(SUM(ep.share_amount), 0) AS owed_amount
      FROM expense_participants ep
      JOIN shared_expenses se ON se.id = ep.expense_id
      GROUP BY ep.profile_id
    ),
    -- 所有 trip 成员
    members AS (
      SELECT tm.profile_id AS uid
      FROM trip_members tm
      WHERE tm.trip_id = p_trip_id
    )
  SELECT
    m.uid AS profile_id,
    p.nickname,
    COALESCE(pa.paid_amount, 0) AS total_paid,
    COALESCE(ow.owed_amount, 0) AS total_owed,
    COALESCE(pa.paid_amount, 0) - COALESCE(ow.owed_amount, 0) AS balance
  FROM members m
  JOIN profiles p ON p.id = m.uid
  LEFT JOIN paid pa ON pa.uid = m.uid
  LEFT JOIN owed ow ON ow.uid = m.uid;
END;
$$ LANGUAGE plpgsql STABLE;
