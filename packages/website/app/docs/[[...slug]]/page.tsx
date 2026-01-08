import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';

export default async function Page(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    const MDX = page.data.body;

    return (
        <DocsPage toc={page.data.toc} full={page.data.full}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription>{page.data.description}</DocsDescription>
            <DocsBody>
                <MDX components={{ ...defaultMdxComponents }} />
            </DocsBody>
        </DocsPage>
    );
}

export async function generateStaticParams() {
    return source.generateParams();
}

export async function generateMetadata(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://contextmcp.ai";
    const slug = params.slug?.join("/") || "";
    const url = slug ? `${siteUrl}/docs/${slug}` : `${siteUrl}/docs`;

    return {
        title: page.data.title,
        description: page.data.description || "ContextMCP documentation - Learn how to set up and use ContextMCP for indexing your documentation.",
        openGraph: {
            title: `${page.data.title} | ContextMCP`,
            description: page.data.description || "ContextMCP documentation",
            url,
            type: "article",
        },
        twitter: {
            title: `${page.data.title} | ContextMCP`,
            description: page.data.description || "ContextMCP documentation",
        },
        alternates: {
            canonical: url,
        },
    };
}
