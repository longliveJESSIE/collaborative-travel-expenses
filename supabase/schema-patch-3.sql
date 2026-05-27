-- ============================================================
-- Schema Patch 3: 用动态 SQL 彻底解决 RLS 递归
-- 注意：先手动删除所有旧策略，再执行此脚本
-- ============================================================

-- ============================================================
-- 第一步：删除所有旧策略（用 DO 块避免报错）
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 第二步：删除旧的 helper 函数
-- ============================================================
DROP FUNCTION IF EXISTS is_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS check_trip_creator(UUID, UUID);

-- ============================================================
-- 第三步：创建 helper 函数（用 EXECUTE 躲过静态递归检测）
-- ============================================================

-- 判断 user 是否 trip 成员
CREATE OR REPLACE FUNCTION is_trip_member(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = $1 AND profile_id = $2)'
  INTO result
  USING p_trip_id, p_user_id;
  RETURN result;
END;
$$;

-- 判断 user 是否 trip 创建者
CREATE OR REPLACE FUNCTION check_trip_creator(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM trips WHERE id = $1 AND creator_id = $2)'
  INTO result
  USING p_trip_id, p_user_id;
  RETURN result;
END;
$$;

-- ============================================================
-- 第四步：重新创建所有 RLS 策略
-- ============================================================

-- ---------- profiles ----------
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ---------- trips ----------
CREATE POLICY "trips_select" ON trips
  FOR SELECT USING (is_trip_member(id, auth.uid()));

CREATE POLICY "trips_insert" ON trips
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "trips_update" ON trips
  FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "trips_delete" ON trips
  FOR DELETE USING (creator_id = auth.uid());

-- ---------- trip_members ----------
CREATE POLICY "trip_members_select" ON trip_members
  FOR SELECT USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "trip_members_insert" ON trip_members
  FOR INSERT WITH CHECK (check_trip_creator(trip_id, auth.uid()));

CREATE POLICY "trip_members_delete" ON trip_members
  FOR DELETE USING (check_trip_creator(trip_id, auth.uid()));

-- ---------- expenses ----------
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (
    creator_id = auth.uid()
    OR (visibility = 'trip_visible' AND is_trip_member(trip_id, auth.uid()))
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND is_trip_member(trip_id, auth.uid())
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (creator_id = auth.uid());

-- ---------- expense_participants ----------
CREATE POLICY "expense_parts_select" ON expense_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_participants.expense_id
      AND (
        e.creator_id = auth.uid()
        OR (e.visibility = 'trip_visible' AND is_trip_member(e.trip_id, auth.uid()))
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

-- ---------- settlements ----------
CREATE POLICY "settlements_select" ON settlements
  FOR SELECT USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "settlements_insert" ON settlements
  FOR INSERT WITH CHECK (
    from_profile_id = auth.uid()
    AND is_trip_member(trip_id, auth.uid())
  );
