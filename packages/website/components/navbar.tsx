"use client";

import Link from "next/link";
import Image from "next/image";
import { Github } from "lucide-react";
import { useEffect, useState } from "react";

export function Navbar() {
    const [isInHero, setIsInHero] = useState(true);

    useEffect(() => {
        const heroSection = document.getElementById("hero-section");
        if (!heroSection) return;

        const checkScrollPosition = () => {
            const rect = heroSection.getBoundingClientRect();
            const navbarHeight = 64; // h-16 = 64px
            // Hero section is "in view" if its bottom edge is still below the navbar
            // We want transparent navbar only when hero section is at or near the top
            const heroBottom = rect.bottom;
            setIsInHero(heroBottom > navbarHeight + 100); // Add some buffer
        };

        // Check on mount
        checkScrollPosition();

        // Listen to scroll for responsive updates
        window.addEventListener("scroll", checkScrollPosition, { passive: true });
        window.addEventListener("resize", checkScrollPosition, { passive: true });

        return () => {
            window.removeEventListener("scroll", checkScrollPosition);
            window.removeEventListener("resize", checkScrollPosition);
        };
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 ${
            isInHero 
                ? "border-b border-transparent bg-transparent backdrop-blur-none" 
                : "border-b border-white/5 bg-black/50 backdrop-blur-md"
        }`}>
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="relative h-7 w-7 transition-transform group-hover:scale-105">
                        <Image
                            src="/SVG/Brandmark.svg"
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
                        href="https://github.com/dodopayments/context-mcp"
                        target="_blank"
                        className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-all hover:bg-white/20 hover:text-white hover:border-white/35"
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
