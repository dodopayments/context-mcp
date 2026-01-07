"use client";

import Link from "next/link";
import Image from "next/image";
import { Github } from "lucide-react";

export function Navbar() {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/5 bg-black/50 backdrop-blur-md">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="relative h-7 w-7 transition-transform group-hover:scale-105">
                        <Image
                            src="/SVG/brandmark.svg"
                            alt="Dodo Payments"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span className="text-zinc-600 font-light">/</span>
                    <span className="font-sans font-semibold tracking-tight text-white">ContextMCP</span>
                </Link>

                <div className="flex items-center gap-4">
                    <Link
                        href="https://github.com/dodopayments/contextmcp"
                        target="_blank"
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-zinc-400 transition-all hover:bg-white/10 hover:text-white hover:border-white/20"
                    >
                        <Github className="h-4 w-4" />
                        <span>Star</span>
                    </Link>
                    <Link
                        href="/docs"
                        target="_blank"
                        className="hidden sm:flex h-9 items-center rounded-full bg-[#60A5FA] px-5 text-sm font-semibold text-black transition-transform hover:scale-105 active:scale-95"
                    >
                        Get Started
                    </Link>
                </div>
            </div>
        </nav>
    );
}
