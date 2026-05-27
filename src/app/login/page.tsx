"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/auth";

const loginSchema = z.object({
  nickname: z
    .string()
    .min(2, "昵称至少 2 个字符")
    .max(20, "昵称最多 20 个字符"),
  password: z
    .string()
    .min(6, "密码至少 6 个字符"),
});

const signupSchema = loginSchema.extend({
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<LoginValues & { confirmPassword?: string }>({
    resolver: zodResolver(mode === "login" ? loginSchema : signupSchema),
  });

  const onSubmit = async (values: LoginValues & { confirmPassword?: string }) => {
    setServerError("");
    setLoading(true);

    let result;
    if (mode === "login") {
      result = await signIn(values.nickname, values.password);
    } else {
      result = await signUp(values.nickname, values.password);
    }

    setLoading(false);

    if (result.error) {
      setServerError(result.error);
    } else {
      router.push("/trips");
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setServerError("");
    reset();
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-white">
      <div className="max-w-sm mx-auto w-full">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-black rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl">¥</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">转我五毛</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {mode === "login" ? "登录你的账户" : "创建新账户"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Nickname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              昵称
            </label>
            <input
              {...register("nickname")}
              type="text"
              autoComplete="username"
              placeholder="输入昵称"
              className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base placeholder:text-gray-300 focus:outline-none focus:border-black focus:bg-white transition-colors"
            />
            {errors.nickname && (
              <p className="text-red-500 text-xs mt-1">{errors.nickname.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              密码
            </label>
            <input
              {...register("password")}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="输入密码（至少 6 位）"
              className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base placeholder:text-gray-300 focus:outline-none focus:border-black focus:bg-white transition-colors"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password (signup only) */}
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                确认密码
              </label>
              <input
                {...register("confirmPassword")}
                type="password"
                autoComplete="new-password"
                placeholder="再次输入密码"
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base placeholder:text-gray-300 focus:outline-none focus:border-black focus:bg-white transition-colors"
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          )}

          {/* Server Error */}
          {serverError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{serverError}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-black text-white rounded-xl text-base font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading
              ? "请稍候..."
              : mode === "login"
              ? "登录"
              : "注册"}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="text-center mt-6">
          <button
            onClick={toggleMode}
            className="text-sm text-gray-500 hover:text-black transition-colors"
          >
            {mode === "login" ? "没有账户？点击注册" : "已有账户？点击登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
