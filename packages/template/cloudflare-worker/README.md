# ContextMCP - Cloudflare Worker

A remote MCP (Model Context Protocol) server deployed on Cloudflare Workers with built-in Pinecone vector search for your documentation.

## Features

- **MCP Server**: Streamable HTTP transport for AI assistants (Cursor, Windsurf, Claude Desktop)
- **Semantic Search**: Vector search across your indexed documentation
- **REST API**: Direct search endpoint for non-MCP integrations
- **Durable Objects**: State management via Cloudflare's agents framework

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- OpenAI API key (for embeddings)
- Pinecone API key (for vector search)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

Set the required secrets using Wrangler:

```bash
# OpenAI API key for generating embeddings
npx wrangler secret put OPENAI_API_KEY

# Pinecone API key for vector search
npx wrangler secret put PINECONE_API_KEY
```

### 3. Environment Variables

Configure these variables in `wrangler.jsonc`:

| Variable              | Default                   | Description                      |
| --------------------- | ------------------------- | -------------------------------- |
| `SERVER_NAME`         | `my-docs-mcp`             | Name of your MCP server          |
| `SERVER_DESCRIPTION`  | `Search documentation...` | Description shown to clients     |
| `PINECONE_INDEX_NAME` | `my-docs-mcp`             | Pinecone index name              |
| `EMBEDDING_MODEL`     | `text-embedding-3-large`  | OpenAI embedding model           |
| `DEFAULT_TOP_K`       | `10`                      | Default number of search results |
| `MAX_TOP_K`           | `20`                      | Maximum allowed results          |

#### Vector Database

| Variable             | Default                 | Description                                       |
| -------------------- | ----------------------- | ------------------------------------------------- |
| `VECTORDB_PROVIDER`  | `pinecone`              | `pinecone` or `qdrant` — the backend to search    |
| `VECTORDB_NAMESPACE` | _(none)_                | Optional namespace; must match what you indexed   |
| `QDRANT_URL`         | `http://localhost:6333` | Qdrant base URL (when `VECTORDB_PROVIDER=qdrant`) |
| `QDRANT_COLLECTION`  | `PINECONE_INDEX_NAME`   | Qdrant collection name                            |

Set the Qdrant Cloud key (if any) as a secret: `wrangler secret put QDRANT_API_KEY`.

> **Qdrant note:** reranking uses Pinecone's inference API and is therefore
> Pinecone-only. With `VECTORDB_PROVIDER=qdrant`, results are returned in
> vector-similarity order (no rerank step), and `PINECONE_API_KEY` is not
> required.

#### Reranking Configuration

| Variable             | Default              | Description                                     |
| -------------------- | -------------------- | ----------------------------------------------- |
| `ENABLE_RERANK`      | `true`               | Set to `false` to disable reranking (Pinecone)  |
| `RERANK_MODEL`       | `pinecone-rerank-v0` | Pinecone reranking model to use                 |
| `RERANK_FETCH_COUNT` | `30`                 | Number of candidates to fetch before reranking  |
| `MAX_RERANK_CHARS`   | `1200`               | Max characters per document for reranking input |

## Local Development

Start the local development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

## Deployment

### Manual Deployment

```bash
npm run deploy
```

### CI/CD Deployment

Set up GitHub Actions with these secrets:

- `CLOUDFLARE_API_TOKEN` - API token with Workers permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

To create an API token:

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with **Edit Cloudflare Workers** permissions

## Endpoints

| Endpoint  | Method   | Description                           |
| --------- | -------- | ------------------------------------- |
| `/`       | GET      | Landing page with setup instructions  |
| `/mcp`    | POST     | MCP server endpoint (Streamable HTTP) |
| `/search` | GET/POST | REST API for direct search            |
| `/health` | GET      | Health check endpoint                 |

### REST API Usage

```bash
# GET request
curl "https://your-worker.workers.dev/search?query=how+to+do+something&limit=5"

# POST request
curl -X POST "https://your-worker.workers.dev/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "how to do something", "limit": 5}'
```

## MCP Client Configuration

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "my-docs-mcp": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "my-docs-mcp": {
      "serverUrl": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "my-docs-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://your-worker.workers.dev/mcp"]
    }
  }
}
```

## Monitoring

View real-time logs:

```bash
npm run tail
```
