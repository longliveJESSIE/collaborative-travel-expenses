-- ============================================================
-- Schema Patch 8: 删邀请码，改模糊搜索
-- ============================================================

-- 删触发器
DROP TRIGGER IF EXISTS trg_gen_invite_code ON trips;
DROP FUNCTION IF EXISTS gen_invite_code();

-- 删邀请码列
ALTER TABLE trips DROP COLUMN IF EXISTS invite_code;

-- 删旧搜索函数
DROP FUNCTION IF EXISTS search_joinable_trips(TEXT);

-- 新搜索函数：仅按名称模糊匹配
CREATE OR REPLACE FUNCTION search_joinable_trips(p_query TEXT)
RETURNS TABLE(
  id UUID, name TEXT, description TEXT, base_currency TEXT, member_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT t.id, t.name, t.description, t.base_currency, COUNT(tm.id) AS mc
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
