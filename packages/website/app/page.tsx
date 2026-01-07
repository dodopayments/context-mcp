"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Copy, Terminal, Search, Database, Server, Zap, Globe, GitBranch, Cloud, Cpu, Play, FileText, Settings, Radio } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { cn } from "@/lib/utils";
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
      {copied ? <Check className="h-3 w-3 text-[#60A5FA]" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only">Copy</span>
    </button>
  );
}

function ConnectorLine() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center px-2 relative">
      <div className="h-[1px] w-full bg-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent w-1/2 animate-[shimmer_2s_infinite] opacity-50" />
      </div>
    </div>
  );
}

function IntegrationNode({ icon: Icon, label, subLabel }: { icon: any, label: string, subLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-4 relative z-10 group">
      <div className="h-16 w-16 rounded-2xl bg-[#09090b] border border-white/10 flex items-center justify-center shadow-2xl transition-all duration-300 group-hover:border-[#60A5FA]/50 group-hover:shadow-[0_0_30px_rgba(96,165,250,0.1)]">
        <Icon className="h-7 w-7 text-zinc-400 group-hover:text-[#60A5FA] transition-colors" />
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
    <main className="min-h-screen overflow-x-hidden selection:bg-[#60A5FA] selection:text-black bg-black">
      {/* Black base layer */}
      <div className="fixed inset-0 bg-black" />
      {/* Grid pattern layer */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <Navbar />

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-12 md:pt-48 md:pb-32 px-6">
        <div className="mx-auto max-w-7xl relative z-10">
          <div className="flex flex-col items-center text-center max-w-6xl mx-auto mb-20">

            <h1 className="text-4xl md:text-4xl lg:text-7xl font-bold tracking-tighter text-white mb-8">
              Self-hosted alternative to <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60A5FA] to-[#3B82F6] animate-gradient bg-[length:200%_auto]">Context7</span>
            </h1>

            <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl leading-relaxed mb-10 font-medium">
              Index your documentation from different sources. <br />
              <span className="text-zinc-500">Give your AI Agents up-to-date information.</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
              <div className="flex items-center gap-2 rounded-lg bg-zinc-950 border border-white/10 p-1 pl-4 pr-1 font-mono text-sm text-zinc-400 min-w-[320px] shadow-2xl">
                <span className="mr-0 text-[#60A5FA]">$</span>
                <span className="flex-1 text-left">npx contextmcp init</span>
                <CopyButton text="npx contextmcp init" />
              </div>
              <Link
                href="/docs"
                className="h-10 px-6 rounded-lg bg-white text-black font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors"
              >
                Documentation
              </Link>
            </div>
          </div>

          <HeroVisual />

        </div>
      </section>


      {/* --- SENTRA CASE STUDY --- */}
      <section className="py-24 border-y border-white/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="bg-gradient-to-br from-zinc-900 to-black rounded-3xl border border-white/10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#60A5FA] opacity-[0.03] blur-[100px] pointer-events-none rounded-full" />

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
                  Powering <span className="text-[#60A5FA]">Sentra</span> at Dodo Payments.
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
      <section className="py-24 px-6 relative z-10 border-t border-white/5">
        <FeaturesBento />
      </section>

      <FaqSection />
      <Footer />
    </main>
  );
}
