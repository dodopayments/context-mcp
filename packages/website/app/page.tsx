import type { Metadata } from "next";
import { HomeClient } from "./home-client";

export const metadata: Metadata = {
  title: "ContextMCP - Self-hosted alternative to Context7",
  description: "Index your documentation from different sources. Give your AI Agents up-to-date information. Self-hosted MCP server that creates a queryable brain from your documentation.",
  openGraph: {
    title: "ContextMCP - Self-hosted alternative to Context7",
    description: "Index your documentation from different sources. Give your AI Agents up-to-date information.",
    url: "/",
    type: "website",
  },
  twitter: {
    title: "ContextMCP - Self-hosted alternative to Context7",
    description: "Index your documentation from different sources. Give your AI Agents up-to-date information.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <HomeClient />;
}
