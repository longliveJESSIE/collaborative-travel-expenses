-- 允许 trip 成员创建任意 settlement
DROP POLICY IF EXISTS "s2" ON settlements;
CREATE POLICY "s2" ON settlements FOR INSERT WITH CHECK (
  trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);
