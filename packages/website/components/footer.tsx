import Link from "next/link";
import Image from "next/image";

export function Footer() {
    return (
        <footer className="border-t border-white/5 py-16 bg-black/50 backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row">

                <div className="flex flex-col items-center md:items-start gap-2">
                    <div className="flex items-center gap-2">
                        <div className="relative h-5 w-5 opacity-80">
                            <Image
                                src="/SVG/brandmark.svg"
                                alt="Dodo Payments"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="text-zinc-400 font-light">/</span>
                        <span className="font-semibold text-white">ContextMCP</span>
                    </div>
                    <p className="text-sm text-zinc-400">
                        Maintained by the engineering team at <a href="https://dodopayments.com" className="text-zinc-300 hover:text-[#60A5FA] transition-colors">Dodo Payments</a>.
                    </p>
                </div>

                <div className="flex gap-6 text-sm font-medium text-zinc-300">
                    <Link href="https://github.com/dodopayments/contextmcp" className="hover:text-white transition-colors">GitHub</Link>
                    <Link href="https://x.com/dodopayments" className="hover:text-white transition-colors">X/Twitter</Link>
                    <Link href="https://dodopayments.com/docs" className="hover:text-white transition-colors">Dodo Docs</Link>
                </div>
            </div>
        </footer>
    );
}
