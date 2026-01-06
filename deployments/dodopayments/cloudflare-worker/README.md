# Dodo Knowledge MCP - Cloudflare Worker

A remote MCP (Model Context Protocol) server deployed on Cloudflare Workers with built-in Pinecone vector search for Dodo Payments documentation.

## Features

- **MCP Server**: Streamable HTTP transport for AI assistants (Cursor, Windsurf, Claude Desktop)
- **Semantic Search**: Vector search across API Reference, SDK docs, BillingSDK, and guides
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
cd cloudflare-worker
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

The following variables are pre-configured in `wrangler.jsonc`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PINECONE_INDEX_NAME` | `dodo-knowledge-mcp` | Pinecone index name |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | OpenAI embedding model |
| `DEFAULT_TOP_K` | `10` | Default number of search results |
| `MAX_TOP_K` | `50` | Maximum allowed results |

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

The worker is automatically deployed via GitHub Actions when changes are pushed to the `main` branch. See `.github/workflows/deploy-cloudflare-worker.yml`.

**Required GitHub Secrets:**

- `CLOUDFLARE_API_TOKEN` - API token with Workers permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

To create an API token:
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with **Edit Cloudflare Workers** permissions

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing page with setup instructions |
| `/mcp` | POST | MCP server endpoint (Streamable HTTP) |
| `/search` | GET/POST | REST API for direct search |
| `/health` | GET | Health check endpoint |

### REST API Usage

```bash
# GET request
curl "https://your-worker.workers.dev/search?query=how+to+create+a+payment&limit=5"

# POST request
curl -X POST "https://your-worker.workers.dev/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "how to create a payment", "limit": 5}'
```

## MCP Client Configuration

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
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
    "dodo-knowledge-mcp": {
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
    "dodo-knowledge-mcp": {
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

## License

© DodoPayments. All rights reserved.

