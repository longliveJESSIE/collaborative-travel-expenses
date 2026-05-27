-- 统一修复：trip creator 可以管理该 trip 下所有 expenses 和 participants

-- expenses UPDATE/DELETE
DROP POLICY IF EXISTS "e3" ON expenses;
DROP POLICY IF EXISTS "e4" ON expenses;
CREATE POLICY "e3" ON expenses FOR UPDATE USING (
  creator_id = auth.uid()
  OR trip_id IN (SELECT id FROM trips WHERE creator_id = auth.uid())
);
CREATE POLICY "e4" ON expenses FOR DELETE USING (
  creator_id = auth.uid()
  OR trip_id IN (SELECT id FROM trips WHERE creator_id = auth.uid())
);

-- expense_participants INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "ep2" ON expense_participants;
DROP POLICY IF EXISTS "ep3" ON expense_participants;
DROP POLICY IF EXISTS "ep4" ON expense_participants;

CREATE POLICY "ep2" ON expense_participants FOR INSERT WITH CHECK (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
  OR expense_id IN (
    SELECT e.id FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE t.creator_id = auth.uid()
  )
);

CREATE POLICY "ep3" ON expense_participants FOR UPDATE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
  OR expense_id IN (
    SELECT e.id FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE t.creator_id = auth.uid()
  )
);

CREATE POLICY "ep4" ON expense_participants FOR DELETE USING (
  expense_id IN (SELECT id FROM expenses WHERE creator_id = auth.uid())
  OR expense_id IN (
    SELECT e.id FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE t.creator_id = auth.uid()
  )
);
