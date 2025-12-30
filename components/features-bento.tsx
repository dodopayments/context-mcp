"use client";

import { motion } from "framer-motion";
import { GitBranch, Box, Search, Zap, Code2, Globe, Database } from "lucide-react";

export function FeaturesBento() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto">

            {/* 1. CONFIGURATION (Small) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="md:col-span-1 rounded-3xl border border-white/5 bg-[#09090b] p-6 flex flex-col justify-between group hover:border-white/10 transition-colors"
            >
                <div>
                    <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Code2 className="h-5 w-5 text-zinc-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Zero Config</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                        Drop a <code className="text-xs bg-white/10 px-1 py-0.5 rounded text-zinc-300">config.yaml</code> in your repo. ContextMCP handle the parsing, chunking, and indexing automatically.
                    </p>
                </div>
            </motion.div>

            {/* 2. AST CHUNKING (Large - Visual) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="md:col-span-2 rounded-3xl border border-white/5 bg-[#09090b] overflow-hidden group hover:border-white/10 transition-colors relative"
            >
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#60A5FA] opacity-[0.03] blur-[80px]" />

                <div className="p-8 pb-0">
                    <h3 className="text-2xl font-bold text-white mb-2"><span className="text-[#60A5FA]">AST-Aware</span> Chunking</h3>
                    <p className="text-zinc-500 max-w-md">
                        Our AST-based parsers understand code blocks, headers, and semantic boundaries to keep context intact.
                    </p>
                </div>

                {/* Visualizer Diff */}
                <div className="mt-8 grid grid-cols-2 text-[10px] font-mono border-t border-white/5">
                    <div className="bg-red-500/5 p-4 space-y-2 border-r border-white/5">
                        <div className="text-red-400 font-semibold mb-2">Standard RAG</div>
                        <div className="text-zinc-500 opacity-50">function payment(req) {'{'}</div>
                        <div className="text-zinc-500 opacity-50 pl-2">const {'{'}id{'}'} = req.body;</div>
                        <div className="bg-red-500/20 text-red-200 p-1 rounded">--- CHUNK BREAK ---</div>
                        <div className="text-zinc-500 opacity-50 pl-2">return stripe.charge(id);</div>
                        <div className="text-zinc-500 opacity-50">{'}'}</div>
                    </div>
                    <div className="bg-[#60A5FA]/5 p-4 space-y-2">
                        <div className="text-[#60A5FA] font-semibold mb-2">ContextMCP</div>
                        <div className="text-zinc-300">function payment(req) {'{'}</div>
                        <div className="text-zinc-300 pl-2">const {'{'}id{'}'} = req.body;</div>
                        <div className="text-zinc-300 pl-2">return stripe.charge(id);</div>
                        <div className="text-zinc-300">{'}'}</div>
                        <div className="text-[#60A5FA] text-[9px] mt-1">✓ Full Context Preserved</div>
                    </div>
                </div>
            </motion.div>

            {/* 3. EDGE SERVING (Medium) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="md:col-span-2 rounded-3xl border border-white/5 bg-[#09090b] p-8 flex items-center justify-between gap-8 group hover:border-white/10 transition-colors"
            >
                <div className="max-w-xs">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                        <Globe className="h-5 w-5 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Edge Native</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                        Served from Cloudflare Workers. Ensuring fast latency for your AI Agents.
                    </p>
                </div>

                {/* Simple Map/Globe Visual */}
                <div className="h-32 w-32 rounded-full border border-white/10 bg-black flex items-center justify-center relative">
                    <div className="absolute inset-0 border border-white/5 rounded-full animate-[ping_3s_linear_infinite]" />
                    <Globe className="h-12 w-12 text-zinc-700" />
                    <div className="absolute top-1/4 right-1/4 h-2 w-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
                    <div className="absolute bottom-1/3 left-1/3 h-2 w-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
                </div>
            </motion.div>

            {/* 4. OPEN SOURCE (Small) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="md:col-span-1 rounded-3xl border border-white/5 bg-[#09090b] p-6 flex flex-col justify-between group hover:border-white/10 transition-colors"
            >
                <div>
                    <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
                        <GitBranch className="h-5 w-5 text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Open Source</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                        Fork it. Self-host it. Own your data.
                    </p>
                </div>
                {/* <div className="mt-4 flex gap-2">
                    <span className="text-[10px] bg-white/5 px-2 py-1 rounded text-zinc-400 border border-white/5">MIT License</span>
                </div> */}
            </motion.div>

        </div>
    );
}
