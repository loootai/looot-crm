import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/shell/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "looot CRM", template: "%s · looot CRM" },
  description: "A small CRM with buying-intent signals built in. Every signal is fetched through a looot job with its price shown first.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1612" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
