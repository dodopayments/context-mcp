import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { AnalyticsPageView } from "@/components/analytics-pageview";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://contextmcp.ai"),
  title: {
    default: "ContextMCP - The Knowledge Layer for AI",
    template: "%s | ContextMCP",
  },
  description: "Self-hosted MCP server that creates a queryable brain from your documentation. Connect Cursor, Windsurf, and Claude to your codebase's ground truth. Index documentation from multiple sources and serve it via Model Context Protocol.",
  keywords: [
    "MCP",
    "Model Context Protocol",
    "AI documentation",
    "vector database",
    "embeddings",
    "self-hosted",
    "Cursor",
    "Windsurf",
    "Claude",
    "Pinecone",
    "OpenAPI",
    "documentation indexing",
    "AI agents",
    "knowledge base",
  ],
  authors: [{ name: "Dodo Payments" }],
  creator: "Dodo Payments",
  publisher: "Dodo Payments",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ContextMCP",
    title: "ContextMCP - The Knowledge Layer for AI",
    description: "Self-hosted MCP server that creates a queryable brain from your documentation. Connect Cursor, Windsurf, and Claude to your codebase's ground truth.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ContextMCP - The Knowledge Layer for AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ContextMCP - The Knowledge Layer for AI",
    description: "Self-hosted MCP server that creates a queryable brain from your documentation.",
    creator: "@dodopayments",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/SVG/Brandmark.svg",
    apple: "/SVG/Brandmark.svg",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  verification: {
    // Add your verification codes here when available
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
  },
};

function StructuredData() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://contextmcp.ai";
  
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ContextMCP",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    description: "Self-hosted MCP server that creates a queryable brain from your documentation. Connect Cursor, Windsurf, and Claude to your codebase's ground truth.",
    url: siteUrl,
    author: {
      "@type": "Organization",
      name: "Dodo Payments",
      url: "https://dodopayments.com",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ContextMCP",
    url: siteUrl,
    description: "Self-hosted MCP server that creates a queryable brain from your documentation.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/docs?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-[#60A5FA] selection:text-black`}>
        <GoogleAnalytics />
        <Suspense fallback={null}>
          <AnalyticsPageView />
        </Suspense>
        <StructuredData />
        <div className="noise-bg" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
