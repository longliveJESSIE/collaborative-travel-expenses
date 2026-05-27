"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "消费", href: "" },
  { label: "结算", href: "/settle" },
  { label: "信息", href: "/members" },
];

export default function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname();
  const basePath = `/trips/${params.id}`;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pb-16">{children}</main>

      {/* 底部 Tab 导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex justify-around items-center h-14">
          {tabs.map((tab) => {
            const href = `${basePath}${tab.href}`;
            const isActive = pathname === href || (tab.href === "" && pathname === basePath);
            return (
              <Link
                key={tab.label}
                href={href}
                className={`flex-1 text-center text-sm py-2 ${
                  isActive ? "text-blue-600 font-semibold" : "text-gray-500"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
