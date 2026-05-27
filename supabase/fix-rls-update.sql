-- 允许 trip creator 编辑/删除旅行内所有消费
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
