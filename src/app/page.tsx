"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export default function HomePage() {
  const router = useRouter();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id);
        router.replace("/trips");
      } else {
        router.replace("/login");
      }
    });
  }, [router, fetchProfile]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">加载中...</p>
    </div>
  );
}
