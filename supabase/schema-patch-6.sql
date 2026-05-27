-- ============================================================
-- Schema Patch 6: 用 RPC 安全添加/移除成员，避免 RLS 递归
-- ============================================================

-- 1. 添加成员的 RPC（trip creator 才可以）
CREATE OR REPLACE FUNCTION add_trip_member(p_trip_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- 检查调用者是否 trip creator
  IF NOT EXISTS (
    SELECT 1 FROM trips WHERE id = p_trip_id AND creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '只有旅行创建者可以添加成员';
  END IF;

  -- 检查是否已在旅行中
  IF EXISTS (
    SELECT 1 FROM trip_members WHERE trip_id = p_trip_id AND profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION '该用户已在旅行中';
  END IF;

  INSERT INTO trip_members (trip_id, profile_id)
  VALUES (p_trip_id, p_profile_id);

  RETURN TRUE;
END;
$$;

-- 2. 移除成员的 RPC
CREATE OR REPLACE FUNCTION remove_trip_member(p_trip_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- 检查调用者是否 trip creator（或是自己退出的情况）
  IF NOT EXISTS (
    SELECT 1 FROM trips WHERE id = p_trip_id AND creator_id = auth.uid()
  ) AND auth.uid() != p_profile_id THEN
    RAISE EXCEPTION '没有权限移除成员';
  END IF;

  DELETE FROM trip_members
  WHERE trip_id = p_trip_id AND profile_id = p_profile_id;

  RETURN TRUE;
END;
$$;

-- 3. 保持原来的 RLS 策略不变（自己可以加入/退出）
-- 不需要改 trip_members 策略，避免循环引用
