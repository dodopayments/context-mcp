"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Copy, Terminal, Search, Database, Server, Zap, Globe, GitBranch, Cloud, Cpu, Play, FileText, Settings, Radio } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { cn } from "@/lib/utils";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { FaqSection } from "@/components/faq";
import { HeroVisual } from "@/components/hero-visual";
import { FeaturesBento } from "@/components/features-bento";


// --- UI Components ---

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="group relative flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/10"
    >
      {copied ? <Check className="h-3 w-3 text-[#B2F348]" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only">Copy</span>
    </button>
  );
}

function TerminalWindow() {
  return (
    <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#09090b] shadow-2xl relative overflow-hidden group">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-white/5 bg-[#09090b] px-3 py-2">
        <div className="flex gap-1.5 mr-4">
          <div className="h-3 w-3 rounded-full bg-[#2a2a2c]" />
          <div className="h-3 w-3 rounded-full bg-[#2a2a2c]" />
          <div className="h-3 w-3 rounded-full bg-[#2a2a2c]" />
        </div>
        <div className="flex items-center gap-2 rounded bg-[#18181b] px-3 py-1 text-xs text-zinc-300 border border-white/5">
          <Terminal className="h-3 w-3 text-[#B2F348]" />
          <span className="font-mono">zsh — contextmcp</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 font-mono text-xs md:text-sm leading-relaxed text-zinc-300 space-y-4 font-jetbrains-mono">
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-[#B2F348]">➜</span>
          <span>~</span>
          <span>git clone https://github.com/dodopayments/contextmcp</span>
        </div>
        <div className="text-zinc-500">Cloning into 'contextmcp'...</div>

        <div className="flex items-center gap-2 pt-2 text-zinc-500">
          <span className="text-[#B2F348]">➜</span>
          <span>contextmcp</span>
          <span className="text-white">npm run reindex</span>
        </div>

        <div className="space-y-1 pl-4 pt-1 border-l-2 border-white/10 ml-1">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Parsing <span className="text-white">stripe-docs</span> (GitHub)</span>
            <span className="text-[#B2F348]">Done</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Chunking 452 files</span>
            <span className="text-[#B2F348]">Done</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Generating embeddings (OpenAI)</span>
            <span className="text-[#B2F348]">Done</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Pushing to Pinecone</span>
            <span className="text-[#B2F348]">Done</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 text-zinc-500 animate-pulse">
          <span className="text-[#B2F348]">➜</span>
          <span>contextmcp</span>
          <span className="w-2 h-4 bg-zinc-500 block"></span>
        </div>
      </div>

      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#B2F348] opacity-[0.03] blur-[100px] pointer-events-none" />
    </div>
  );
}

function ConnectorLine() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center px-2 relative">
      <div className="h-[1px] w-full bg-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#B2F348] to-transparent w-1/2 animate-[shimmer_2s_infinite] opacity-50" />
      </div>
    </div>
  );
}

function IntegrationNode({ icon: Icon, label, subLabel }: { icon: any, label: string, subLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-4 relative z-10 group">
      <div className="h-16 w-16 rounded-2xl bg-[#09090b] border border-white/10 flex items-center justify-center shadow-2xl transition-all duration-300 group-hover:border-[#B2F348]/50 group-hover:shadow-[0_0_30px_rgba(178,243,72,0.1)]">
        <Icon className="h-7 w-7 text-zinc-400 group-hover:text-[#B2F348] transition-colors" />
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-white mb-0.5">{label}</div>
        <div className="text-xs text-zinc-500 font-mono">{subLabel}</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-black overflow-x-hidden selection:bg-[#B2F348] selection:text-black">
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none mask-gradient-to-b" />
      <Navbar />

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-12 md:pt-48 md:pb-32 px-6">
        <div className="mx-auto max-w-7xl relative z-10">
          <div className="flex flex-col items-center text-center max-w-6xl mx-auto mb-20">

            {/* Badge */}
            {/* <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-[11px] font-mono font-medium text-zinc-400 backdrop-blur-sm">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B2F348] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B2F348]"></span>
              </span>
              <span>Self-hosted MCP Server</span>
            </div> */}

            <h1 className="text-4xl md:text-4xl lg:text-7xl font-bold tracking-tighter text-white mb-8">
              Self-hosted alternative to <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#B2F348] to-[#27C93F] animate-gradient bg-[length:200%_auto]">Context7</span>
            </h1>

            <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl leading-relaxed mb-10 font-medium">
              Index your documentation from different sources. <br />
              <span className="text-zinc-500">Give your AI Agents up-to-date information.</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
              <div className="flex items-center gap-2 rounded-lg bg-zinc-950 border border-white/10 p-1 pl-4 pr-1 font-mono text-sm text-zinc-400 min-w-[320px] shadow-2xl">
                <span className="mr-0 text-[#B2F348]">$</span>
                <span className="flex-1 text-left">git clone https://github.com/dodopayments/contextmcp.git</span>
                <CopyButton text="git clone https://github.com/dodopayments/contextmcp.git" />
              </div>
              <Link
                href="https://github.com/dodopayments/contextmcp"
                className="h-10 px-6 rounded-lg bg-white text-black font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors"
              >
                Documentation
              </Link>
            </div>
          </div>

          {/* HERO VISUAL */}
          <HeroVisual />

        </div>
      </section>


      {/* --- SENTRA CASE STUDY (Feature Highlight) --- */}
      <section className="py-24 border-y border-white/5 bg-[#050505]">
        <div className="mx-auto max-w-7xl px-6">
          <div className="bg-gradient-to-br from-zinc-900 to-black rounded-3xl border border-white/10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#B2F348] opacity-[0.03] blur-[100px] pointer-events-none rounded-full" />

            <div className="grid lg:grid-cols-2 gap-0">
              <div className="p-12 lg:p-16 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-white/5">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10">
                    <Image src="/SVG/brandmark.svg" width={20} height={20} alt="Dodo" />
                  </div>
                  <div className="h-px w-8 bg-zinc-800" />
                  <span className="text-sm font-mono text-zinc-400">CASE STUDY</span>
                </div>

                <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                  Powering <span className="text-[#B2F348]">Sentra</span> at Dodo Payments.
                </h2>
                <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                  We built ContextMCP to solve a problem we faced ourselves.
                  Sentra, our AI agent, needed reliable access to documentations spread across multiple repositories.
                </p>

                <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                  Context7 could not keep documentation in sync, which led to outdated context and unreliable answers.
                </p>

                <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                  ContextMCP indexes everything at set intervals so Sentra always works with up to date information.
                </p>

              </div>

              <div className="relative h-full min-h-[300px] w-full flex items-center justify-center">
                <Image
                  src="/sentra.png"
                  alt="Sentra AI Agent"
                  width={500}
                  height={500}
                  className="object-contain w-full h-full max-w-md drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- FEATURES BENTO --- */}
      <section className="py-24 px-6 relative z-10 border-t border-white/5 bg-[#050505]">
        <FeaturesBento />
      </section>

      {/* --- ARCHITECTURE DIAGRAM --- */}

      {/* <section className="py-24 px-6 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              From raw documentation to semantic search in four simple steps.
            </p>
          </div>

          <ArchitectureDiagram />
        </div>
      </section> */}

      <FaqSection />
      <Footer />
    </main>
  );
}
