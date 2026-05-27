-- 允许所有 trip 成员编辑消费和参与人
DROP POLICY IF EXISTS "e3" ON expenses;
CREATE POLICY "e3" ON expenses FOR UPDATE USING (
  trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS "ep2" ON expense_participants;
DROP POLICY IF EXISTS "ep3" ON expense_participants;
DROP POLICY IF EXISTS "ep4" ON expense_participants;

CREATE POLICY "ep2" ON expense_participants FOR INSERT WITH CHECK (
  expense_id IN (SELECT e.id FROM expenses e WHERE e.trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
);
CREATE POLICY "ep3" ON expense_participants FOR UPDATE USING (
  expense_id IN (SELECT e.id FROM expenses e WHERE e.trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
);
CREATE POLICY "ep4" ON expense_participants FOR DELETE USING (
  expense_id IN (SELECT e.id FROM expenses e WHERE e.trip_id IN (SELECT trip_id FROM trip_members WHERE profile_id = auth.uid()))
);
