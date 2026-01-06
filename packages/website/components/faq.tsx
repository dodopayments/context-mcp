"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
    {
        question: "Why not just use Context7 or standard RAG?",
        answer: "Context7 often struggles with stale data. Standard RAG blindly chunks text, breaking code logic. ContextMCP solves both: it runs on a schedule to keep context fresh and uses AST-aware chunking to preserve function/class boundaries, ensuring your AI Agent never hallucinates due to missing context."
    },
    {
        question: "How do I keep my documentation index up-to-date?",
        answer: "You don't need to manually re-index. ContextMCP includes a 'reindex' command that you can trigger via a GitHub Action cron job or a simple webhook. This ensures that as soon as you merge a PR, your AI's brain is updated."
    },
    {
        question: "Is my data sent to any third-party servers?",
        answer: "No. You self-host the entire pipeline. The embeddings live in your Pinecone index, and the compute runs on your Cloudflare/local environment. Your proprietary code and documentation never touch our servers."
    },
    {
        question: "Can I index multiple repositories at once?",
        answer: "Yes. The `config.yaml` supports multiple sources. You can combine your public docs, private internal monorepo, and API references into a single unified knowledge graph that your AI can query cross-context."
    },
    {
        question: "Which LLMs and Vector DBs do you support?",
        answer: "We support OpenAI embedding models and Pinecone as a vector database. However, the system is modular. You can swap in Voyage AI, Cochrane, or Qdrant by modifying the adapter layer in the codebase."
    }
];

function FaqItem({ question, answer, isOpen, onClick }: { question: string, answer: string, isOpen: boolean, onClick: () => void }) {
    return (
        <div className="border-b border-white/5">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-between py-6 text-left transition-colors hover:text-[#60A5FA]"
            >
                <span className={cn("text-lg font-medium", isOpen ? "text-white" : "text-zinc-400")}>{question}</span>
                <div className={cn("relative flex h-5 w-5 items-center justify-center transition-colors", isOpen ? "text-[#60A5FA]" : "text-zinc-600")}>
                    <Plus className={cn("absolute h-5 w-5 transition-transform duration-300", isOpen ? "rotate-45 opacity-0" : "rotate-0 opacity-100")} />
                    <Minus className={cn("absolute h-5 w-5 transition-transform duration-300", isOpen ? "rotate-0 opacity-100" : "-rotate-45 opacity-0")} />
                </div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <p className="pb-6 text-zinc-400 leading-relaxed max-w-2xl">
                            {answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function FaqSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="py-24 px-6 relative z-10 bg-[#050505] border-t border-white/5">
            <div className="mx-auto max-w-3xl">
                <div className="mb-12 text-center">
                    <h2 className="text-3xl font-bold text-white mb-4">Frequently Asked Questions</h2>
                    <p className="text-zinc-400">Everything you need to know about the Context Engine.</p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-[#0A0A0A] px-8">
                    {FAQS.map((faq, index) => (
                        <FaqItem
                            key={index}
                            {...faq}
                            isOpen={index === openIndex}
                            onClick={() => setOpenIndex(index === openIndex ? null : index)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
