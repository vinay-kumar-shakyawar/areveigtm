import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { HydrationMarker } from "@/components/app/hydration-marker";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AREVEI GTM", template: "%s · AREVEI GTM" },
  description: "AI-powered go-to-market platform: find buyers, research them, run multichannel outreach, manage replies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <HydrationMarker />
        {children}
      </body>
    </html>
  );
}
