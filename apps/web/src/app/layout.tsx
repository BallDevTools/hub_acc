import type { Metadata } from "next";
import { Anuphan, Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const anuphan = Anuphan({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-anuphan" });

export const metadata: Metadata = { title: "Hub ACC" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme ถูกตั้งโดยสคริปต์ก่อน React โหลด จึงต่างจาก HTML จากเซิร์ฟเวอร์ได้
    <html lang="th" className={`${geist.variable} ${anuphan.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
