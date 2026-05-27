-- Debug: 测试 auth.uid() 在 SECURITY DEFINER 函数中的行为

CREATE OR REPLACE FUNCTION test_auth_uid()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT auth.uid()::text;
$$;
