import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { progress } from "@/lib/progress";

import { StepNav } from "./step-nav";
import "./globals.css";
import { READ_ONLY, READ_ONLY_REASON } from "@/lib/mode";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Perry",
  description: "Measure how AI agents shop your store, fix it two ways with Factory Droid, and verify every purchase.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const done = await progress();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-ground font-sans text-ink antialiased">
        <header className="sticky top-0 z-20 border-b border-seam bg-panel/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 text-xl font-semibold tracking-tight">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-perry ring-4 ring-perry-wash" />
              perry
            </Link>
            <StepNav progress={done} />
            <Link href="/history" className="hidden shrink-0 text-[13px] font-medium text-faint hover:text-ink lg:block">
              Fix history
            </Link>
          </div>
        </header>
        {READ_ONLY && (
          <p className="border-b border-seam bg-perry-wash px-4 py-2 text-center text-[13px] text-perry-deep">
            {READ_ONLY_REASON} See the demo video for the live run.
          </p>
        )}
        {children}
      </body>
    </html>
  );
}
