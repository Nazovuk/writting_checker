import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polyglot Writing Coach",
  description: "Multilingual grammar checker and writing coach"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
