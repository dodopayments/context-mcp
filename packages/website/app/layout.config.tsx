import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Github } from 'lucide-react';
import Image from 'next/image';

export const baseOptions: BaseLayoutProps = {
    nav: {
        title: (
            <div className="flex items-center gap-2">
                <Image
                    src="/SVG/brandmark.svg"
                    alt="ContextMCP"
                    width={28}
                    height={28}
                    className="dark:invert-0"
                />
                <span className="text-fd-muted-foreground">/</span>
                <span className="font-medium">ContextMCP</span>
            </div>
        ),
        transparentMode: 'none',
    },
    githubUrl: 'https://github.com/dodopayments/contextmcp',
    links: [
        {
            icon: <Github className="size-5" />,
            text: 'GitHub',
            url: 'https://github.com/dodopayments/contextmcp',
            external: true,
        },
    ],
};
