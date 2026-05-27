-- ============================================================
-- 修复：重建触发器 + 回填已有旅行的 creator 到 trip_members
-- ============================================================

-- 1. 确保 handle_new_trip 存在且正确
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

-- 2. 回填：把已有旅行的 creator 补加到 trip_members（如果缺失）
INSERT INTO trip_members (trip_id, profile_id, role)
SELECT t.id, t.creator_id, 'creator'
FROM trips t
WHERE NOT EXISTS (
  SELECT 1 FROM trip_members tm
  WHERE tm.trip_id = t.id AND tm.profile_id = t.creator_id
)
ON CONFLICT (trip_id, profile_id) DO NOTHING;
