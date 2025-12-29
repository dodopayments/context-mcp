import Link from "next/link";
import Image from "next/image";

export function Footer() {
    return (
        <footer className="border-t border-white/5 bg-[#000000] py-16">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row">

                <div className="flex flex-col items-center md:items-start gap-2">
                    <div className="flex items-center gap-2">
                        <div className="relative h-6 w-6 opacity-80">
                            <Image
                                src="/SVG/brandmark.svg"
                                alt="Dodo Payments Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="font-semibold text-zinc-300">ContextMCP</span>
                    </div>
                    <p className="text-sm text-zinc-500">
                        Maintained by the engineering team at <a href="https://dodopayments.com" className="text-zinc-400 hover:text-[#B2F348] transition-colors">Dodo Payments</a>.
                    </p>
                </div>

                <div className="flex gap-6 text-sm font-medium text-zinc-500">
                    <Link href="https://github.com/dodopayments/contextmcp" className="hover:text-white transition-colors">GitHub</Link>
                    <Link href="https://twitter.com/dodopayments" className="hover:text-white transition-colors">Twitter</Link>
                    <Link href="https://dodopayments.com/docs" className="hover:text-white transition-colors">Dodo Docs</Link>
                </div>
            </div>
        </footer>
    );
}
