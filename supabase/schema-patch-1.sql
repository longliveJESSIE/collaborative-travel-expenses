-- ============================================================
-- Schema Patch 1: 修复 RLS 递归 + 辅助函数
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- ---------- 辅助函数：判断是否 trip 成员（绕过 RLS）----------
CREATE OR REPLACE FUNCTION is_trip_member(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = p_trip_id AND profile_id = p_user_id
  );
$$;

-- ---------- 修复 trip_members SELECT（原策略会自引用导致无限递归）----------
DROP POLICY IF EXISTS "trip_members_select" ON trip_members;
CREATE POLICY "trip_members_select" ON trip_members
  FOR SELECT USING (is_trip_member(trip_id, auth.uid()));

-- ---------- 修复 trips SELECT（同样改用 helper，避免递归风险）----------
DROP POLICY IF EXISTS "trips_select_member" ON trips;
CREATE POLICY "trips_select_member" ON trips
  FOR SELECT USING (is_trip_member(id, auth.uid()));

-- ---------- 修复 expenses SELECT ----------
DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (
    creator_id = auth.uid()
    OR (
      visibility = 'trip_visible'
      AND is_trip_member(trip_id, auth.uid())
    )
  );

-- ---------- 修复 expense_participants SELECT ----------
DROP POLICY IF EXISTS "expense_parts_select" ON expense_participants;
CREATE POLICY "expense_parts_select" ON expense_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_participants.expense_id
      AND (
        e.creator_id = auth.uid()
        OR (
          e.visibility = 'trip_visible'
          AND is_trip_member(e.trip_id, auth.uid())
        )
      )
    )
  );

-- ---------- 修复 settlements SELECT ----------
DROP POLICY IF EXISTS "settlements_select" ON settlements;
CREATE POLICY "settlements_select" ON settlements
  FOR SELECT USING (is_trip_member(trip_id, auth.uid()));

-- ---------- 修复 expenses INSERT ----------
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND is_trip_member(trip_id, auth.uid())
  );

-- ---------- 修复 settlements INSERT ----------
DROP POLICY IF EXISTS "settlements_insert" ON settlements;
CREATE POLICY "settlements_insert" ON settlements
  FOR INSERT WITH CHECK (
    from_profile_id = auth.uid()
    AND is_trip_member(trip_id, auth.uid())
  );

-- ---------- 修复 trip_members INSERT ----------
DROP POLICY IF EXISTS "trip_members_insert_creator" ON trip_members;
CREATE POLICY "trip_members_insert_creator" ON trip_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid()
    )
  );

-- ---------- 修复 trip_members DELETE ----------
DROP POLICY IF EXISTS "trip_members_delete_creator" ON trip_members;
CREATE POLICY "trip_members_delete_creator" ON trip_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM trips WHERE id = trip_id AND creator_id = auth.uid()
    )
  );
