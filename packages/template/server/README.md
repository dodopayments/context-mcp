# ContextMCP — Self-hosted Node.js Server

A long-running Node.js server that serves your documentation search over the
**Model Context Protocol** (MCP) and a simple REST endpoint. Use this instead
of the Cloudflare Worker when you want to self-host (Docker, a VM, Fly.io, etc.)
and/or use a local embedding provider like Ollama.

It queries the **same Pinecone index** your `reindex` job populates, so results
match the Worker deployment.

## Endpoints

| Method | Path      | Description                                          |
| ------ | --------- | ---------------------------------------------------- |
| POST   | `/mcp`    | MCP Streamable HTTP transport (stateless)            |
| POST   | `/search` | REST search: `{ "query": "...", "limit": 10 }`       |
| GET    | `/health` | Liveness probe                                       |

## Quick start

```bash
cp .env.example .env   # fill in PINECONE_API_KEY, PINECONE_INDEX_NAME, etc.
npm install
npm start              # or: npm run dev (watch mode)
```

Then point an MCP client at `http://localhost:8787/mcp`, or query directly:

```bash
curl -X POST http://localhost:8787/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how do I authenticate?", "limit": 5}'
```

## Docker

```bash
docker build -t contextmcp-server .
docker run --rm -p 8787:8787 --env-file .env contextmcp-server
```

The image runs a healthcheck against `/health`.

## Configuration

All configuration is via environment variables — see `.env.example`. The
`EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` must match how
the index was created by `reindex`.

## Connecting MCP clients

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "contextmcp": {
      "url": "http://localhost:8787/mcp"
    }
  }
}
```
