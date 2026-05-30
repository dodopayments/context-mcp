# ContextMCP

Self-hosted MCP server for your documentation. Index your docs, APIs, and SDKs for semantic search via the Model Context Protocol.

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Required environment variables:

- `PINECONE_API_KEY` - Your Pinecone API key
- `OPENAI_API_KEY` - Your OpenAI API key

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

# Run the indexer (incremental by default)
npm run reindex

# Or do a dry run first
npm run reindex:dry

# Force a full rebuild
npm run reindex:full
```

### 4. Deploy the MCP Server

```bash
cd cloudflare-worker
npm install

# Set secrets
wrangler secret put PINECONE_API_KEY
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy
```

## Available Parsers

| Parser     | Use Case                                   | Extensions       |
| ---------- | ------------------------------------------ | ---------------- |
| `mdx`      | MDX/ documentation (Mintlify, Fumadocs)    | `.mdx`           |
| `markdown` | Plain markdown files (READMEs, CHANGELOGs) | `.md`            |
| `openapi`  | OpenAPI/Swagger specifications             | `.yaml`, `.json` |

## Source Types

| Type     | Description                  |
| -------- | ---------------------------- |
| `github` | Fetch from GitHub repository |
| `local`  | Local file path              |
| `url`    | Remote URL                   |

## Project Structure

```
├── src/
│   ├── parser/           # Document parsers
│   │   ├── chunkers/     # MDX, Markdown, OpenAPI chunkers
│   │   └── core/         # Shared utilities
│   ├── embeddings/       # OpenAI embedding generation
│   ├── sources/          # GitHub, local, URL fetchers
│   ├── config/           # Config schema and loader
│   └── types/            # TypeScript types
├── cloudflare-worker/    # MCP server deployment
├── scripts/              # Reindex and utility scripts
├── config.yaml           # Your configuration
└── .env                  # API keys (not committed)
```

## Scripts

| Script                               | Description                                      |
| ------------------------------------ | ------------------------------------------------ |
| `npm run reindex`                    | Incrementally index changed documentation chunks |
| `npm run reindex:full`               | Clear Pinecone and rebuild the full index        |
| `npm run reindex:dry`                | Dry run (parse and diff only, no uploads)        |
| `npm run reindex -- --source=<name>` | Incrementally index a specific source            |
| `npm run clean:vectors`              | Clear all vectors from Pinecone                  |
| `npm run typecheck`                  | TypeScript type checking                         |

## Incremental Reindexing

`npm run reindex` stores chunk hashes in `data/index-manifest.json` and skips embedding unchanged chunks on later runs. The command reports `added`, `updated`, `unchanged`, and `deleted` counts, then embeds only the added/updated chunks and deletes removed chunk IDs from Pinecone.

The `data/` directory is generated and ignored by git. In CI, cache `data/index-manifest.json` between scheduled runs so incremental reindexing can compare against the previous run.

## Documentation

For full documentation, visit [contextmcp.ai/docs](https://contextmcp.ai/docs)

## License

MIT
