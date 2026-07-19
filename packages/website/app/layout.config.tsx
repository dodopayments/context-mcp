import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Home } from 'lucide-react';
import Image from 'next/image';

export const baseOptions: BaseLayoutProps = {
    nav: {
        title: (
            <div className="flex items-center gap-2">
                <Image
                    src="/SVG/Brandmark.svg"
                    alt="ContextMCP"
                    width={26}
                    height={26}
                />
                <span className="font-light text-zinc-600">/</span>
                <span className="font-semibold tracking-tight">ContextMCP</span>
            </div>
        ),
        transparentMode: 'none',
    },
    // Renders its own GitHub icon — don't add a second one to `links`.
    githubUrl: 'https://github.com/dodopayments/context-mcp',
    links: [
        {
            type: 'icon',
            icon: <Home className="size-5" />,
            text: 'Home',
            url: '/',
        },
    ],
};
