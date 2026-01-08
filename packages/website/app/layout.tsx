import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContextMCP - The Knowledge Layer for AI",
  description: "Self-hosted MCP server that creates a queryable brain from your documentation. Connect Cursor, Windsurf, and Claude to your codebase's ground truth.",
  icons: {
    icon: "/SVG/Brandmark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-[#60A5FA] selection:text-black`}>
        <div className="noise-bg" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
