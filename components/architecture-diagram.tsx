"use client";

import { motion } from "framer-motion";
import {
    GitBranch,
    FileText,
    Cpu,
    Database,
    Terminal,
    ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

function FlowArrow() {
    return (
        <div className="hidden md:flex items-center justify-center px-4">
            <div className="relative">
                <ArrowRight className="h-5 w-5 text-zinc-700" />
                <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                    <ArrowRight className="h-5 w-5 text-[#60A5FA]/50" />
                </motion.div>
            </div>
        </div>
    );
}

function Step({
    icon: Icon,
    title,
    description,
    accentColor = "#60A5FA",
    delay = 0
}: {
    icon: any;
    title: string;
    description: string;
    accentColor?: string;
    delay?: number;
}) {
    return (
        <motion.div
            className="flex-1 group"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay }}
        >
            <div className="relative p-6 rounded-2xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/80 hover:border-white/10 transition-all duration-300">
                {/* Subtle top accent */}
                <div
                    className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: `linear-gradient(to right, transparent, ${accentColor}40, transparent)` }}
                />

                <div
                    className="h-12 w-12 rounded-xl border flex items-center justify-center mb-4 transition-colors duration-300"
                    style={{
                        backgroundColor: `${accentColor}08`,
                        borderColor: `${accentColor}20`
                    }}
                >
                    <Icon className="h-6 w-6" style={{ color: accentColor }} />
                </div>

                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
            </div>
        </motion.div>
    );
}

export function ArchitectureDiagram() {
    return (
        <div className="w-full">
            {/* Simple flow diagram */}
            <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-0">

                <Step
                    icon={GitBranch}
                    title="Ingest"
                    description="Point to any GitHub repo, local folder, or documentation URL."
                    accentColor="#60a5fa"
                    delay={0}
                />

                <FlowArrow />

                <Step
                    icon={FileText}
                    title="Parse & Chunk"
                    description="AST-aware chunking preserves code blocks and semantic context."
                    accentColor="#60A5FA"
                    delay={0.1}
                />

                <FlowArrow />

                <Step
                    icon={Cpu}
                    title="Embed"
                    description="Generate vector embeddings using OpenAI or local models."
                    accentColor="#a78bfa"
                    delay={0.2}
                />

                <FlowArrow />

                <Step
                    icon={Database}
                    title="Store & Serve"
                    description="Push to Pinecone and serve via MCP protocol to your editor."
                    accentColor="#f97316"
                    delay={0.3}
                />
            </div>

            {/* Bottom connection to editors */}
            <motion.div
                className="mt-8 pt-8 border-t border-white/5"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
            >
                <div className="flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <Terminal className="h-4 w-4" />
                        <span>Works with</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {["Cursor", "Windsurf", "Claude Desktop"].map((editor) => (
                            <span
                                key={editor}
                                className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors cursor-default"
                            >
                                {editor}
                            </span>
                        ))}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
