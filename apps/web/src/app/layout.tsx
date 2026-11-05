import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const plex = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
});

export const metadata: Metadata = { title: "Hub ACC" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={plex.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
