-- ============================================================
-- Schema Final: 经过测试验证的 RLS 策略
-- 前提：已经执行过原始 schema.sql 建表
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- 清除所有旧策略
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS is_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS check_trip_creator(UUID, UUID);

-- ============================================================
-- profiles
-- ============================================================
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- trips
-- 关键：trips_select 只用 creator_id 检查，避免 RETURNING 时的子查询问题
-- ============================================================
CREATE POLICY "trips_select" ON trips FOR SELECT USING (
  creator_id = auth.uid()
  OR id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "trips_insert" ON trips FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "trips_update" ON trips FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "trips_delete" ON trips FOR DELETE USING (creator_id = auth.uid());

-- ============================================================
-- trip_members — 全部简单列检查，不引用其他表
-- ============================================================
CREATE POLICY "trip_members_select" ON trip_members FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "trip_members_insert" ON trip_members FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "trip_members_delete" ON trip_members FOR DELETE
  USING (profile_id = auth.uid());

-- ============================================================
-- expenses
-- ============================================================
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (
  creator_id = auth.uid()
  OR (visibility = 'trip_visible'
      AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (
  creator_id = auth.uid()
  AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (creator_id = auth.uid());

-- ============================================================
-- expense_participants
-- ============================================================
CREATE POLICY "expense_parts_select" ON expense_participants FOR SELECT USING (
  expense_id IN (
    SELECT id FROM expenses WHERE creator_id = auth.uid()
       OR (visibility = 'trip_visible'
           AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
  )
);
CREATE POLICY "expense_parts_insert" ON expense_participants FOR INSERT WITH CHECK (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);
CREATE POLICY "expense_parts_update" ON expense_participants FOR UPDATE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);
CREATE POLICY "expense_parts_delete" ON expense_participants FOR DELETE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);

-- ============================================================
-- settlements
-- ============================================================
CREATE POLICY "settlements_select" ON settlements FOR SELECT USING (
  trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "settlements_insert" ON settlements FOR INSERT WITH CHECK (
  from_profile_id = auth.uid()
  AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
