-- ============================================================
-- Schema Patch 7: 用 RPC 查询成员列表，解决 RLS 可见性问题
-- ============================================================

-- 先删除旧版
DROP FUNCTION IF EXISTS get_trip_members(UUID);

-- 获取 trip 所有成员（SECURITY DEFINER 绕过 RLS）
CREATE OR REPLACE FUNCTION get_trip_members(p_trip_id UUID)
RETURNS TABLE(
  member_id UUID,
  member_trip_id UUID,
  member_profile_id UUID,
  member_role TEXT,
  member_joined_at TIMESTAMPTZ,
  member_nickname TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = p_trip_id AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '你不是该旅行的成员';
  END IF;

  RETURN QUERY
  SELECT
    tm.id,
    tm.trip_id,
    tm.profile_id,
    tm.role,
    tm.joined_at,
    p.nickname
  FROM trip_members tm
  JOIN profiles p ON p.id = tm.profile_id
  WHERE tm.trip_id = p_trip_id
  ORDER BY tm.joined_at ASC;
END;
$$;
