# Dodo Knowledge MCP

An MCP (Model Context Protocol) server providing semantic search over Dodo Payments documentation. Powers AI assistants with accurate, up-to-date context from docs, SDKs, and API references.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Docs Repos    │     │    Parsers      │     │    Pinecone     │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ dodo-docs │──┼────▶│  │MDX/OpenAPI│──┼────▶│  │  Vectors  │  │
│  │ SDKs (6+) │  │     │  │SDK/Billing│  │     │  │  (3072d)  │  │
│  │billingsdk │  │     │  └───────────┘  │     │  └───────────┘  │
│  └───────────┘  │     └─────────────────┘     └────────┬────────┘
└─────────────────┘                                      │
                                                         ▼
                    ┌────────────────────────────────────────────────┐
                    │              MCP Server                        │
                    │  ┌──────────────┐    ┌──────────────────────┐  │
                    │  │ stdio (local)│    │ HTTP (remote/hosted) │  │
                    │  └──────────────┘    └──────────────────────┘  │
                    └────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your OPENAI_API_KEY and PINECONE_API_KEY

# Parse and embed all documentation
npm run reindex

# Start the MCP server (for local use)
npm run start

# Or start the remote HTTP server (for hosted deployment)
npm run mcp:remote
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings |
| `PINECONE_API_KEY` | Yes | Pinecone API key for vector storage |
| `DODO_DOCS_API_URL` | No | API URL for stdio MCP server (default: `http://localhost:3000`) |
| `MCP_PORT` | No | Port for remote MCP server (default: `3001`) |
| `PINECONE_CLOUD` | No | Pinecone cloud provider (default: `aws`) |
| `PINECONE_REGION` | No | Pinecone region (default: `us-east-1`) |

## MCP Configuration

### Local (stdio transport)

Requires the API server running (`npm run api`):

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "cwd": "/path/to/dodo-knowledge-mcp"
    }
  }
}
```

### Remote (HTTP transport)

Standalone server with built-in Pinecone search:

```json
{
  "mcpServers": {
    "dodo-knowledge-mcp": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

## Available Scripts

### Parsing

```bash
npm run parse:docs        # Parse main documentation (MDX + OpenAPI)
npm run parse:sdk         # Parse SDK repositories
npm run parse:billingsdk  # Parse BillingSDK documentation
```

### Embedding

```bash
npm run embed:docs        # Embed main docs to Pinecone
npm run embed:sdk         # Embed SDK docs to Pinecone
npm run embed:billingsdk  # Embed BillingSDK to Pinecone
```

### Servers

```bash
npm run api              # Start REST API server (port 3000)
npm run start            # Start MCP server (stdio transport)
npm run mcp:remote       # Start remote MCP server (HTTP transport)
```

### Operations

```bash
npm run reindex          # Full reindex: parse + embed all sources
npm run build            # Compile TypeScript to dist/
```

## Documentation Sources

| Source | Repository | Content |
|--------|------------|---------|
| **Docs** | `dodopayments/dodo-docs` | API reference, guides, features, OpenAPI spec |
| **SDK** | `dodopayments/dodopayments-*` | TypeScript, Python, Go, PHP, Java, Ruby, C# SDKs |
| **BillingSDK** | `dodopayments/billingsdk` | React billing components (pricing tables, checkout) |

## Tool: `search_docs`

The MCP server exposes a single tool for semantic search:

```typescript
search_docs({
  query: string,   // What to search for
  limit?: number   // Results count (default: 10, max: 50)
})
```

**Example queries:**
- `"how to create a payment"`
- `"webhook signature verification typescript"`
- `"pricing table component react"`
- `"subscription lifecycle events"`

## API Endpoints

When running the API server (`npm run api`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/llms.txt` | GET | Search docs (`?topic=query&limit=20`) |
| `/health` | GET | Health check |
| `/` | GET | API info |

## Technical Details

- **Embedding Model**: `text-embedding-3-large` (3072 dimensions)
- **Vector Store**: Pinecone (serverless)
- **Chunking**: Semantic splitting by headings with configurable sizes
- **Index Name**: `dodo-knowledge-mcp`

## Project Structure

```
src/
├── api/server.ts           # REST API server
├── mcp/
│   ├── server.ts           # MCP server (stdio)
│   └── remote-server.ts    # MCP server (HTTP)
├── embeddings/
│   ├── core.ts             # Pinecone/OpenAI utilities
│   └── embed.ts            # Embedding generator
├── parser/
│   ├── chunkers/           # Source-specific chunkers
│   ├── core/               # Shared parsing utilities
│   └── parse-*.ts          # CLI parse scripts
├── config/                 # Constants and env validation
└── types/                  # TypeScript interfaces
```

## License

Proprietary - Dodo Payments

