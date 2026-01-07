import 'fumadocs-ui/style.css';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <RootProvider>
            <DocsLayout tree={source.pageTree} {...baseOptions}>
                {children}
            </DocsLayout>
        </RootProvider>
    );
}
