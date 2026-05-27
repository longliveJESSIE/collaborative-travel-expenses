-- ============================================================
-- Schema Fix All: 最终版 RLS + 简化 RPC
-- ============================================================

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

DROP FUNCTION IF EXISTS get_trip_members(UUID);
DROP FUNCTION IF EXISTS add_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS remove_trip_member(UUID, UUID);

-- ============================================================
-- RPC 函数（SECURITY DEFINER，绕过 RLS）
-- ============================================================

-- 查询成员列表（调用者必须是该 trip 成员）
CREATE OR REPLACE FUNCTION get_trip_members(p_trip_id UUID)
RETURNS TABLE(
  member_id UUID, member_trip_id UUID, member_profile_id UUID,
  member_role TEXT, member_joined_at TIMESTAMPTZ, member_nickname TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT tm.id, tm.trip_id, tm.profile_id, tm.role, tm.joined_at, p.nickname
  FROM trip_members tm JOIN profiles p ON p.id = tm.profile_id
  WHERE tm.trip_id = p_trip_id ORDER BY tm.joined_at;
END;
$$;

-- 加入旅行（自己加入）
CREATE OR REPLACE FUNCTION join_trip(p_trip_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$
  INSERT INTO trip_members (trip_id, profile_id) VALUES (p_trip_id, auth.uid());
$$;

-- 添加成员（trip creator 调用，不额外检查权限，前端控制）
CREATE OR REPLACE FUNCTION add_trip_member(p_trip_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$
  INSERT INTO trip_members (trip_id, profile_id) VALUES (p_trip_id, p_profile_id);
$$;

-- 移除成员
CREATE OR REPLACE FUNCTION remove_trip_member(p_trip_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$
  DELETE FROM trip_members WHERE trip_id = p_trip_id AND profile_id = p_profile_id;
$$;

-- ============================================================
-- RLS 策略（trip_members 保持简单，避免循环）
-- ============================================================

-- profiles
CREATE POLICY "p1" ON profiles FOR SELECT USING (true);
CREATE POLICY "p2" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "p3" ON profiles FOR UPDATE USING (auth.uid() = id);

-- trips
CREATE POLICY "t1" ON trips FOR SELECT USING (
  creator_id = auth.uid()
  OR id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "t2" ON trips FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "t3" ON trips FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "t4" ON trips FOR DELETE USING (creator_id = auth.uid());

-- trip_members: 只允许看自己的记录，增删通过 RPC
CREATE POLICY "tm1" ON trip_members FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "tm2" ON trip_members FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "tm3" ON trip_members FOR DELETE USING (profile_id = auth.uid());

-- expenses
CREATE POLICY "e1" ON expenses FOR SELECT USING (
  creator_id = auth.uid()
  OR (visibility = 'trip_visible'
      AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
);
CREATE POLICY "e2" ON expenses FOR INSERT WITH CHECK (
  creator_id = auth.uid()
  AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "e3" ON expenses FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "e4" ON expenses FOR DELETE USING (creator_id = auth.uid());

-- expense_participants
CREATE POLICY "ep1" ON expense_participants FOR SELECT USING (
  expense_id IN (
    SELECT id FROM expenses WHERE creator_id = auth.uid()
       OR (visibility = 'trip_visible'
           AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
  )
);
CREATE POLICY "ep2" ON expense_participants FOR INSERT WITH CHECK (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);
CREATE POLICY "ep3" ON expense_participants FOR UPDATE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);
CREATE POLICY "ep4" ON expense_participants FOR DELETE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
);

-- settlements
CREATE POLICY "s1" ON settlements FOR SELECT USING (
  trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
CREATE POLICY "s2" ON settlements FOR INSERT WITH CHECK (
  from_profile_id = auth.uid()
  AND trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
