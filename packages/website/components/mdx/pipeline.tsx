import {
    Boxes,
    Cloud,
    Database,
    FileCode,
    GitBranch,
    Scissors,
    type LucideIcon,
} from 'lucide-react';

interface Stage {
    icon: LucideIcon;
    title: string;
    detail: string;
}

// Labels are verbatim from the ASCII diagram this replaces.
const STAGES: Stage[] = [
    { icon: GitBranch, title: 'Sources', detail: 'GitHub, GitLab, Local, URL' },
    { icon: FileCode, title: 'Parsers', detail: 'MDX, Markdown, OpenAPI, HTML' },
    { icon: Scissors, title: 'Chunkers', detail: 'Split into optimal sizes' },
    { icon: Boxes, title: 'Embeddings', detail: 'OpenAI, Gemini, Cohere, Voyage, or Ollama' },
    { icon: Database, title: 'Pinecone', detail: 'Vector storage & search' },
    { icon: Cloud, title: 'Worker', detail: 'Cloudflare Workers (MCP + REST)' },
];

/**
 * The indexing pipeline, top to bottom. Replaces the ASCII-art box diagram —
 * same information, but legible on mobile and searchable as real text.
 */
export function Pipeline() {
    return (
        <div className="not-prose my-8 flex flex-col gap-0">
            {STAGES.map((stage, i) => {
                const Icon = stage.icon;
                const isLast = i === STAGES.length - 1;

                return (
                    <div key={stage.title} className="flex gap-4">
                        {/* Rail: icon node + connector to the next stage. */}
                        <div className="flex flex-col items-center">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                                <Icon className="size-4 text-zinc-400" />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-white/10" />}
                        </div>

                        <div className={isLast ? 'pb-0 pt-1' : 'pb-6 pt-1'}>
                            <p className="text-sm font-semibold tracking-tight text-white">
                                {stage.title}
                            </p>
                            <p className="mt-0.5 text-sm text-zinc-500">{stage.detail}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
