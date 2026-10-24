import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentFix",
  description: "Measure, diagnose, repair and verify how AI agents complete tasks on a website.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
