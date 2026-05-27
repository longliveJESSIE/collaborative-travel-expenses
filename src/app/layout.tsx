import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "转我五毛",
  description: "朋友出游AA分账小工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "转我五毛",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-white text-black antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
