-- 批量更新 trip 下所有外币消费的汇率和金额
DROP FUNCTION IF EXISTS refresh_trip_rates(UUID, JSONB);
CREATE OR REPLACE FUNCTION refresh_trip_rates(
  p_trip_id UUID,
  p_rates JSONB  -- {"MYR": 1.62, "JPY": 21.5, ...}
)
RETURNS TABLE(updated_id UUID, old_rate DECIMAL, new_rate DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  rec RECORD;
  rate_val DECIMAL;
BEGIN
  FOR rec IN
    SELECT e.id, e.currency, e.exchange_rate, e.amount
    FROM expenses e
    WHERE e.trip_id = p_trip_id AND e.currency != (SELECT base_currency FROM trips WHERE id = p_trip_id)
  LOOP
    rate_val := (p_rates ->> rec.currency)::DECIMAL;
    IF rate_val IS NOT NULL AND rate_val > 0 THEN
      -- 更新 expense
      UPDATE expenses SET
        exchange_rate = rate_val,
        base_amount = ROUND(rec.amount * rate_val, 2),
        updated_at = NOW()
      WHERE id = rec.id;

      -- 按比例更新 participant share_amount
      UPDATE expense_participants
      SET share_amount = ROUND(share_amount * rate_val / rec.exchange_rate, 2)
      WHERE expense_participants.expense_id = rec.id;

      updated_id := rec.id;
      old_rate := rec.exchange_rate;
      new_rate := rate_val;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
