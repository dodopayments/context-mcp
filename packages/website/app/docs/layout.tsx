import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';

function SidebarFooter() {
    return (
        // px-1.5 lines the text up with the icon glyphs above, which sit in p-1.5 buttons.
        <p className="mt-2 px-1.5 text-xs text-zinc-600">
            Built by{' '}
            <a
                href="https://dodopayments.com"
                className="text-zinc-400 transition-colors hover:text-[#60A5FA]"
            >
                Dodo Payments
            </a>
        </p>
    );
}

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <RootProvider theme={{ enabled: false }}>
            <DocsLayout
                tree={source.pageTree}
                {...baseOptions}
                // The site is dark-only (html.dark is hardcoded), so the toggle
                // would be a control that does nothing.
                themeSwitch={{ enabled: false }}
                sidebar={{ footer: <SidebarFooter /> }}
            >
                {children}
            </DocsLayout>
        </RootProvider>
    );
}
