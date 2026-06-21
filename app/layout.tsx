import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brek's Field Kit",
  description: "A responsive, persistent D&D 5e field dashboard for Brek.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
