-- ============================================================
-- Schema Patch 2: 彻底修复 RLS 递归
-- 策略：trip_members 的 SELECT 绝不引用 trip_members 自身
-- ============================================================

-- 先删除之前有问题的函数和策略
DROP FUNCTION IF EXISTS is_trip_member(UUID, UUID);
DROP POLICY IF EXISTS "trip_members_select" ON trip_members;
DROP POLICY IF EXISTS "trips_select_member" ON trips;
DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expense_parts_select" ON expense_participants;
DROP POLICY IF EXISTS "settlements_select" ON settlements;
DROP POLICY IF EXISTS "settlements_insert" ON settlements;
DROP POLICY IF EXISTS "trip_members_insert_creator" ON trip_members;
DROP POLICY IF EXISTS "trip_members_delete_creator" ON trip_members;

-- ============================================================
-- trip_members SELECT（非递归方案）
-- 规则：
--   1. 用户总是可以看到自己的那条成员记录
--   2. trip 创建者可以看到该 trip 所有成员
-- 这避免了 trip_members 策略查询 trip_members 自身
-- ============================================================
CREATE POLICY "trip_members_select_own" ON trip_members
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "trip_members_select_creator" ON trip_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_members.trip_id AND creator_id = auth.uid()
    )
  );

-- ============================================================
-- trips SELECT
-- trip_members 可以安全地在这里查（不在 trip_members 策略内）
-- ============================================================
CREATE POLICY "trips_select_member" ON trips
  FOR SELECT USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = trips.id AND profile_id = auth.uid()
    )
  );

-- ============================================================
-- expenses SELECT
-- ============================================================
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (
    creator_id = auth.uid()
    OR (
      visibility = 'trip_visible'
      AND (
        EXISTS (
          SELECT 1 FROM trips WHERE id = expenses.trip_id AND creator_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM trip_members
          WHERE trip_id = expenses.trip_id AND profile_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- expenses INSERT
-- ============================================================
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM trip_members
        WHERE trip_id = expenses.trip_id AND profile_id = auth.uid()
      )
    )
  );

-- ============================================================
-- expense_participants SELECT
-- ============================================================
CREATE POLICY "expense_parts_select" ON expense_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_participants.expense_id
      AND (
        e.creator_id = auth.uid()
        OR (
          e.visibility = 'trip_visible'
          AND (
            EXISTS (SELECT 1 FROM trips WHERE id = e.trip_id AND creator_id = auth.uid())
            OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = e.trip_id AND profile_id = auth.uid())
          )
        )
      )
    )
  );

-- ============================================================
-- settlements
-- ============================================================
CREATE POLICY "settlements_select" ON settlements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM trips WHERE id = settlements.trip_id AND creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = settlements.trip_id AND profile_id = auth.uid())
  );

CREATE POLICY "settlements_insert" ON settlements
  FOR INSERT WITH CHECK (
    from_profile_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid())
      OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = settlements.trip_id AND profile_id = auth.uid())
    )
  );

-- ============================================================
-- trip_members INSERT / DELETE（只查 trips，不递归）
-- ============================================================
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
