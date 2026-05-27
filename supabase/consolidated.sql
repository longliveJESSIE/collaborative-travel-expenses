-- ============================================================
-- 合并脚本：一次性重建所有策略和函数
-- 执行此文件即可，无需执行其他 patch
-- ============================================================

-- ──── 清理旧策略 ────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ──── 清理旧函数 ────
DROP FUNCTION IF EXISTS is_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS check_trip_creator(UUID, UUID);
DROP FUNCTION IF EXISTS get_trip_members(UUID);
DROP FUNCTION IF EXISTS add_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS remove_trip_member(UUID, UUID);
DROP FUNCTION IF EXISTS join_trip(UUID);
DROP FUNCTION IF EXISTS search_joinable_trips(TEXT);
DROP FUNCTION IF EXISTS gen_invite_code();

-- ──── 删邀请码 ────
DROP TRIGGER IF EXISTS trg_gen_invite_code ON trips;
ALTER TABLE trips DROP COLUMN IF EXISTS invite_code;

-- ============================================================
-- RPC 函数
-- ============================================================

-- 搜索可加入的旅行（模糊匹配名称）
CREATE OR REPLACE FUNCTION search_joinable_trips(p_query TEXT)
RETURNS TABLE(
  id UUID, name TEXT, description TEXT, base_currency TEXT, member_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT t.id, t.name, t.description, t.base_currency, COUNT(tm.id)
  FROM trips t
  LEFT JOIN trip_members tm ON tm.trip_id = t.id
  WHERE t.status = 'active'
    AND t.name ILIKE '%' || p_query || '%'
    AND t.id NOT IN (
      SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()
    )
  GROUP BY t.id
  ORDER BY t.created_at DESC
  LIMIT 20;
$$;

-- 查询旅行成员列表
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

-- 自己加入旅行
CREATE OR REPLACE FUNCTION join_trip(p_trip_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$
  INSERT INTO trip_members (trip_id, profile_id) VALUES (p_trip_id, auth.uid());
$$;

-- 添加成员（trip creator 调用）
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
-- RLS 策略
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

-- trip_members（极简，避免循环）
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
