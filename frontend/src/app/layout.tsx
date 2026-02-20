import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const heading = Fraunces({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-heading" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Polyglot Writing Coach",
  description: "Multilingual grammar checker and writing coach"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} font-[var(--font-body)]`}>{children}</body>
    </html>
  );
}
