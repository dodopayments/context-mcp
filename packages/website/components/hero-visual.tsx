"use client";

import { motion } from "framer-motion";
import { FileJson, FileText, ArrowRight, Zap, Check, Cloud } from "lucide-react";

export function HeroVisual() {
    return (
        <div className="w-full max-w-5xl mx-auto">
            <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">

                {/* --- LEFT: CONFIG (INPUT) --- */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative rounded-xl border border-white/10 bg-[#0A0A0A] overflow-hidden group"
                >
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0A0A0A]">
                        <FileText className="h-4 w-4 text-zinc-500" />
                        <span className="text-xs font-mono text-zinc-400">config.yaml</span>
                    </div>

                    {/* Content */}
                    <div className="p-4 font-mono text-[10px] sm:text-xs leading-relaxed text-zinc-400">
                        <div className="text-pink-400">sources:</div>
                        <div className="pl-4">
                            <span className="text-zinc-500">- </span>
                            <span className="text-blue-400">name:</span>
                            <span className="text-[#60A5FA]"> dodo-docs</span>
                        </div>
                        <div className="pl-6">
                            <span className="text-blue-400">type:</span>
                            <span className="text-white"> github</span>
                        </div>
                        <div className="pl-6">
                            <span className="text-blue-400">repository:</span>
                            <span className="text-white"> dodopayments/dodo-docs</span>
                        </div>
                        <div className="pl-6">
                            <span className="text-blue-400">parser:</span>
                            <span className="text-white"> mdx</span>
                        </div>
                        <div className="pl-6">
                            <span className="text-blue-400">skipDirs:</span>
                        </div>
                        <div className="pl-8">
                            <span className="text-zinc-500">- </span>
                            <span className="text-white">.git</span>
                        </div>
                        <div className="pl-8">
                            <span className="text-zinc-500">- </span>
                            <span className="text-white">node_modules</span>
                        </div>
                    </div>

                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.div>

                {/* --- MIDDLE: PROCESS (ARROW) --- */}
                <div className="flex justify-center py-4 md:py-0">
                    <div className="relative flex items-center justify-center h-12 w-12 rounded-full border border-white/10 bg-[#0A0A0A]">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border-t border-[#60A5FA] opacity-50"
                        />
                        <Zap className="h-5 w-5 text-[#60A5FA] fill-[#60A5FA]/20" />
                    </div>
                </div>

                {/* --- RIGHT: OUTPUT (SEARCH RESULT) --- */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="relative rounded-xl border border-white/10 bg-[#0A0A0A] overflow-hidden group"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0A0A0A]">
                        <div className="flex items-center gap-2">
                            <FileJson className="h-4 w-4 text-zinc-500" />
                            <span className="text-xs font-mono text-zinc-400">response.json</span>
                        </div>
                        {/* <span className="text-[10px] text-[#A78BFA] font-mono bg-[#A78BFA]/10 px-1.5 py-0.5 rounded">
                            24ms
                        </span> */}
                    </div>

                    {/* Content */}
                    <div className="p-4 font-mono text-[10px] sm:text-xs leading-relaxed text-zinc-400">
                        <div><span className="text-zinc-600">{`{`}</span></div>
                        <div className="pl-4">
                            <span className="text-purple-400">"score"</span>: <span className="text-[#60A5FA]">0.89</span>,
                        </div>
                        <div className="pl-4">
                            <span className="text-purple-400">"heading"</span>: <span className="text-zinc-300">"Quick Start"</span>,
                        </div>
                        <div className="pl-4">
                            <span className="text-purple-400">"content"</span>: <span className="text-zinc-300">"To install Dodo Payments SDK..."</span>,
                        </div>
                        <div className="pl-4">
                            <span className="text-purple-400">"metadata"</span>: <span className="text-zinc-600">{`{`}</span>
                        </div>
                        <div className="pl-8">
                            <span className="text-purple-400">"sourceUrl"</span>: <span className="text-orange-300">".../docs/quickstart.mdx"</span>
                        </div>
                        <div className="pl-4"><span className="text-zinc-600">{`}`}</span></div>
                        <div><span className="text-zinc-600">{`}`}</span></div>
                    </div>

                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.div>

            </div>

            {/* Background Decor */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[120%] bg-[#60A5FA] opacity-[0.03] blur-[100px] -z-10 pointer-events-none rounded-full" />
        </div>
    );
}
