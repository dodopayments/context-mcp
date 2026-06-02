# ContextMCP

Self-hosted MCP server for your documentation. Index your docs, APIs, and SDKs for semantic search via the Model Context Protocol.

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Required environment variables:

- `PINECONE_API_KEY` - Your Pinecone API key (always required)
- One embedding provider key, matching `embeddings.provider` in `config.yaml`:
  - `OPENAI_API_KEY` - if `provider: openai` (default)
  - `GEMINI_API_KEY` - if `provider: gemini`

### Embedding Providers

ContextMCP supports two embedding providers. Pick one in `config.yaml`:

| Provider | `model`                     | `dimensions` | Env var          |
| -------- | --------------------------- | ------------ | ---------------- |
| `openai` | `text-embedding-3-large`    | `3072`       | `OPENAI_API_KEY` |
| `gemini` | `gemini-embedding-2-preview`| `3072`       | `GEMINI_API_KEY` |

You only need the API key for the provider you choose.

### 2. Configure Documentation Sources

Edit `config.yaml` to add your documentation sources:

```yaml
vectordb:
  provider: pinecone
  indexName: my-docs # Your Pinecone index name

embeddings:
  provider: openai
  model: text-embedding-3-large
  dimensions: 3072

sources:
  # MDX documentation (Mintlify, Fumadocs, Docusaurus)
  - name: my-docs
    displayName: 'My Documentation'
    type: github
    repository: myorg/my-docs
    parser: mdx
    baseUrl: https://docs.example.com

  # OpenAPI specification
  - name: my-api
    displayName: 'API Reference'
    type: github
    repository: myorg/my-docs
    path: openapi
    parser: openapi
    baseUrl: https://docs.example.com/api-reference

  # SDK README (plain markdown)
  - name: sdk-typescript
    displayName: 'TypeScript SDK'
    type: github
    repository: myorg/my-sdk-typescript
    parser: markdown
    language: typescript
```

### 3. Index Your Documentation

```bash
# Install dependencies
npm install

# Run the indexer
npm run reindex

# Or do a dry run first
npm run reindex:dry
```

### 4. Deploy the MCP Server

```bash
cd cloudflare-worker
npm install

# Set secrets (use GEMINI_API_KEY instead of OPENAI_API_KEY if provider: gemini)
wrangler secret put PINECONE_API_KEY
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy
```

## Available Parsers

| Parser     | Use Case                                               | Extensions       |
| ---------- | ------------------------------------------------------ | ---------------- |
| `mdx`      | MDX/ documentation (Mintlify, Fumadocs)                | `.mdx`           |
| `markdown` | Plain markdown files (READMEs, CHANGELOGs)             | `.md`            |
| `openapi`  | OpenAPI/Swagger specifications                         | `.yaml`, `.json` |

## Source Types

| Type     | Description                          |
| -------- | ------------------------------------ |
| `github` | Fetch from GitHub repository         |
| `gitlab` | Fetch from GitLab (or self-hosted)   |
| `local`  | Local file path                      |
| `url`    | Remote URL                           |

## Project Structure

```
├── src/
│   ├── parser/           # Document parsers
│   │   ├── chunkers/     # MDX, Markdown, OpenAPI chunkers
│   │   └── core/         # Shared utilities
│   ├── embeddings/       # Embedding generation (OpenAI / Gemini)
│   ├── sources/          # GitHub, local, URL fetchers
│   ├── config/           # Config schema and loader
│   └── types/            # TypeScript types
├── cloudflare-worker/    # MCP server deployment
├── scripts/              # Reindex and utility scripts
├── config.yaml           # Your configuration
└── .env                  # API keys (not committed)
```

## Scripts

| Script                               | Description                     |
| ------------------------------------ | ------------------------------- |
| `npm run reindex`                    | Index all documentation sources |
| `npm run reindex:dry`                | Dry run (no uploads)            |
| `npm run reindex -- --source=<name>` | Index specific source           |
| `npm run clean:vectors`              | Clear all vectors from Pinecone |
| `npm run typecheck`                  | TypeScript type checking        |
| `npm test`                           | Run unit tests (Vitest)         |
| `npm run test:watch`                 | Run unit tests in watch mode    |

## Testing

Unit tests are written with [Vitest](https://vitest.dev) and live next to the
code they cover (`*.test.ts`). Run the suite with:

```bash
npm test
```

## Documentation

For full documentation, visit [contextmcp.ai/docs](https://contextmcp.ai/docs)

## License

Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
