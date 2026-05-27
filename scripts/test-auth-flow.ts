/**
 * 自动化测试：登录 → 创建旅行 → 验证 RLS
 * 运行: npx tsx scripts/test-auth-flow.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateFakeEmail(nickname: string): string {
  const sanitized = nickname.trim().toLowerCase().replace(/\s+/g, ".");
  return `${sanitized}@travelapp.example.com`;
}

async function main() {
  const testNickname = `test_${Date.now()}`;
  const testPassword = "test123456";
  const email = generateFakeEmail(testNickname);

  console.log("=" .repeat(50));
  console.log("测试用户:", testNickname);
  console.log("Email:", email);

  // Step 1: 注册
  console.log("\n[1] 注册...");
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: testPassword,
    options: { data: { nickname: testNickname } },
  });

  if (signUpError) {
    console.error("❌ 注册失败:", signUpError.message);
    return;
  }
  console.log("✅ 注册成功, uid:", signUpData.user?.id);

  // Step 2: 创建旅行
  console.log("\n[2] 创建旅行...");
  const { data: tripData, error: tripError } = await supabase
    .from("trips")
    .insert({
      name: "测试旅行",
      description: "自动测试",
      base_currency: "CNY",
      creator_id: signUpData.user!.id,
    })
    .select()
    .single();

  if (tripError) {
    console.error("❌ 创建旅行失败:", tripError.message);
    console.error("   详情:", JSON.stringify(tripError));
  } else {
    console.log("✅ 创建旅行成功:", tripData.id, tripData.name);
  }

  // Step 3: 验证旅行可见
  console.log("\n[3] 查询旅行列表...");
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*");

  if (tripsError) {
    console.error("❌ 查询失败:", tripsError.message);
  } else {
    console.log(`✅ 查询成功, 共 ${trips?.length} 条旅行`);
    for (const t of trips!) {
      console.log(`   - ${t.name} (${t.id})`);
    }
  }

  // Step 4: 验证 trip_members 触发器
  console.log("\n[4] 验证自动加入 trip_members...");
  if (tripData) {
    const { data: members, error: membersError } = await supabase
      .from("trip_members")
      .select("*")
      .eq("trip_id", tripData.id);

    if (membersError) {
      console.error("❌ 查询成员失败:", membersError.message);
    } else {
      console.log(`✅ 成员数: ${members?.length}`);
      for (const m of members!) {
        console.log(`   - profile: ${m.profile_id}, role: ${m.role}`);
      }
    }
  }

  // Step 5: 清理
  console.log("\n[5] 清理测试数据...");
  if (tripData) {
    await supabase.from("trips").delete().eq("id", tripData.id);
    console.log("✅ 已删除测试旅行");
  }

  console.log("\n" + "=".repeat(50));
  console.log("测试完毕");
}

main().catch(console.error);
