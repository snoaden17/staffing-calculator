import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gmSerif = localFont({
  src: "../fonts/GENTLEMONSTERSERIF-REGULAR.otf",
  variable: "--font-gm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IICOMBINED HC CALCULATOR",
  description: "Head Count Calculator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={gmSerif.className}>{children}</body>
    </html>
  );
}