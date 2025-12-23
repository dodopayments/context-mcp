# Dodo Knowledge MCP

An MCP (Model Context Protocol) server providing semantic search over Dodo Payments documentation. Powers AI assistants with accurate, up-to-date context from docs, SDKs, and API references.

## Architecture

```
                                    Daily Reindex (GitHub Actions)
                                              |
                                              v
+------------------+     +------------------+     +------------------+
|   Source Repos   |     |     Parsers      |     |     Pinecone     |
|                  |     |                  |     |                  |
|  - dodo-docs     | --> |  - MDX/OpenAPI   | --> |  Vector Store    |
|  - SDKs (10+)    |     |  - SDK markdowns |     |  (3072 dims)     |
|  - billingsdk    |     |  - BillingSDK    |     |                  |
+------------------+     +------------------+     +--------+---------+
                                                          |
                                                          v
                                              +-----------+-----------+
                                              |  Cloudflare Worker    |
                                              |                       |
                                              |  /mcp  - MCP (HTTP)   |
                                              |  /search - REST       |
                                              +-----------------------+
```

## Remote MCP Server

The MCP server is deployed on Cloudflare Workers at:

```
https://knowledge.dodopayments.com/mcp
```

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "url": "https://knowledge.dodopayments.com/mcp"
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "serverUrl": "https://knowledge.dodopayments.com/mcp"
    }
  }
}
```

### Claude Desktop

Edit your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://knowledge.dodopayments.com/mcp"]
    }
  }
}
```

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add OPENAI_API_KEY and PINECONE_API_KEY
```

### Indexing Documentation

```bash
# Full reindex (parse + embed all sources)
npm run reindex

# Or run individual steps:
npm run parse:docs        # Parse main documentation
npm run parse:sdk         # Parse SDK repositories
npm run parse:billingsdk  # Parse BillingSDK

npm run embed:docs        # Embed docs to Pinecone
npm run embed:sdk         # Embed SDKs to Pinecone
npm run embed:billingsdk  # Embed BillingSDK to Pinecone
```

### Cloudflare Worker Development

```bash
cd cloudflare-worker

# Install dependencies
npm install

# Set secrets
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PINECONE_API_KEY

# Local development
npm run dev

# Deploy
npm run deploy
```

## Environment Variables

### Root Project (Indexing Scripts)

Required for running indexing and embedding scripts locally:

| Variable           | Required | Default | Description                                                       |
| ------------------ | -------- | ------- | ----------------------------------------------------------------- |
| `OPENAI_API_KEY`   | **Yes**  | -       | OpenAI API key for generating embeddings (text-embedding-3-large) |
| `PINECONE_API_KEY` | **Yes**  | -       | Pinecone API key for vector storage and search                    |

### Cloudflare Worker (Runtime)

#### Secrets (set via `wrangler secret put`)

| Variable           | Required | Description                         |
| ------------------ | -------- | ----------------------------------- |
| `OPENAI_API_KEY`   | **Yes**  | OpenAI API key for query embeddings |
| `PINECONE_API_KEY` | **Yes**  | Pinecone API key for vector search  |

#### Configuration Variables (set in `wrangler.jsonc`)

| Variable              | Required | Default                  | Description                      |
| --------------------- | -------- | ------------------------ | -------------------------------- |
| `PINECONE_INDEX_NAME` | No       | `dodo-knowledge-mcp`     | Name of the Pinecone index       |
| `EMBEDDING_MODEL`     | No       | `text-embedding-3-large` | OpenAI embedding model to use    |
| `DEFAULT_TOP_K`       | No       | `10`                     | Default number of search results |
| `MAX_TOP_K`           | No       | `50`                     | Maximum allowed search results   |

## Available Scripts

| Script                     | Description                              |
| -------------------------- | ---------------------------------------- |
| `npm run parse:docs`       | Parse main documentation (MDX + OpenAPI) |
| `npm run parse:sdk`        | Parse SDK repositories                   |
| `npm run parse:billingsdk` | Parse BillingSDK documentation           |
| `npm run embed:docs`       | Embed main docs to Pinecone              |
| `npm run embed:sdk`        | Embed SDK docs to Pinecone               |
| `npm run embed:billingsdk` | Embed BillingSDK to Pinecone             |
| `npm run clean:vectors`    | Clear all vectors from Pinecone          |
| `npm run reindex`          | Full reindex (clear + parse + embed all) |

## Documentation Sources

| Source     | Repository                    | Content                                          |
| ---------- | ----------------------------- | ------------------------------------------------ |
| Docs       | `dodopayments/dodo-docs`      | API reference, guides, features, OpenAPI spec    |
| SDK        | `dodopayments/dodopayments-*` | TypeScript, Python, Go, PHP, Java, Ruby, C# SDKs |
| BillingSDK | `dodopayments/billingsdk`     | React billing components                         |

## API Endpoints

The Cloudflare Worker exposes:

| Endpoint  | Method    | Description                          |
| --------- | --------- | ------------------------------------ |
| `/mcp`    | POST      | MCP Streamable HTTP                  |
| `/search` | GET, POST | REST API for direct search           |
| `/health` | GET       | Health check                         |
| `/`       | GET       | Landing page with setup instructions |

### REST API Usage

```bash
# GET request with query params
curl "https://knowledge.dodopayments.com/search?query=how+to+create+a+payment&limit=5"

# POST request with JSON body
curl -X POST https://knowledge.dodopayments.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "how to create a payment", "limit": 5}'
```

## MCP Tool: search_docs

The server exposes a single tool for semantic search:

```typescript
search_docs({
  query: string, // What to search for
  limit?: number, // Results count (default: 5, max: 20)
});
```

Example queries:

- "how to create a payment"
- "webhook signature verification typescript"
- "pricing table component react"
- "subscription lifecycle events"

## Project Structure

```
dodo-knowledge-mcp/
├── cloudflare-worker/          # Cloudflare Worker (MCP + REST API)
│   ├── src/index.ts            # Worker entry point
│   ├── wrangler.jsonc          # Wrangler configuration
│   └── package.json
├── src/
│   ├── embeddings/             # Embedding generation
│   │   ├── core.ts             # Pinecone/OpenAI utilities
│   │   └── embed.ts            # CLI embedding script
│   ├── parser/
│   │   ├── chunkers/           # Source-specific chunkers
│   │   ├── core/               # Shared parsing utilities
│   │   └── parse-*.ts          # Parse scripts
│   ├── config/                 # Constants and env validation
│   └── types/                  # TypeScript interfaces
├── scripts/
│   ├── reindex.ts              # Daily reindex orchestration
│   └── clean-vectors.ts        # Pinecone cleanup utility
├── data/                       # Generated index files (gitignored)
└── .github/workflows/
    └── daily-reindex.yml       # Automated daily reindex
```

## Technical Details

### Search Pipeline

1. **Vector Search**: Fetches top 30 candidates from Pinecone using cosine similarity
2. **Reranking**: Uses Pinecone's `pinecone-rerank-v0` model to reorder results by semantic relevance
3. **Return**: Top N results (default: 5, max: 20) after reranking

### Stack

- **Embedding Model**: `text-embedding-3-large` (3072 dimensions)
- **Vector Store**: Pinecone (serverless, AWS us-east-1)
- **Reranker**: Pinecone Inference API (`pinecone-rerank-v0`)
- **Chunking**: Semantic splitting by headings
- **Index Name**: `dodo-knowledge-mcp`
- **Runtime**: Cloudflare Workers with Durable Objects

## GitHub Actions

The repository includes a workflow for automated daily reindexing:

- Runs daily at 2 AM UTC
- Clears existing vectors
- Parses all documentation sources
- Generates and uploads new embeddings
- Can be triggered manually via workflow_dispatch

Required secrets:

- `OPENAI_API_KEY`
- `PINECONE_API_KEY`

## License

Proprietary - Dodo Payments
