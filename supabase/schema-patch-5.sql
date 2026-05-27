-- ============================================================
-- Schema Patch 5: 加入旅行 & 邀请码
-- ============================================================

-- 1. 给 trips 加 invite_code（短邀请码）
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 为已有数据生成 invite_code
UPDATE trips SET invite_code = upper(left(replace(gen_random_uuid()::text, '-', ''), 6))
WHERE invite_code IS NULL;

-- 2. 触发器：新建旅行自动生成 invite_code
CREATE OR REPLACE FUNCTION gen_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invite_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 6));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gen_invite_code ON trips;
CREATE TRIGGER trg_gen_invite_code
  BEFORE INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION gen_invite_code();

-- 3. 搜索可加入的旅行（RPC，绕过 RLS）
CREATE OR REPLACE FUNCTION search_joinable_trips(p_query TEXT)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  base_currency TEXT,
  member_count BIGINT,
  invite_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.id, t.name, t.description, t.base_currency,
    COUNT(tm.id) AS member_count,
    t.invite_code
  FROM trips t
  LEFT JOIN trip_members tm ON tm.trip_id = t.id
  WHERE t.status = 'active'
    AND (p_query = '' OR t.name ILIKE '%' || p_query || '%' OR t.invite_code = upper(p_query))
    AND t.id NOT IN (
      SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()
    )
  GROUP BY t.id
  ORDER BY t.created_at DESC
  LIMIT 20;
$$;

-- 4. 通过 invite_code 查询旅行详情（用于加入确认）
CREATE OR REPLACE FUNCTION get_trip_by_invite(p_code TEXT)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  base_currency TEXT,
  member_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.id, t.name, t.description, t.base_currency,
    COUNT(tm.id) AS member_count
  FROM trips t
  LEFT JOIN trip_members tm ON tm.trip_id = t.id
  WHERE t.invite_code = upper(p_code) AND t.status = 'active'
  GROUP BY t.id;
$$;
