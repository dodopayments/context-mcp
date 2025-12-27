# ContextMCP

> **Self-hosted MCP server for your documentation**

ContextMCP makes your documentation searchable by AI coding assistants like Cursor, Windsurf, and Claude Desktop. Enable semantic search across your docs, SDKs, and API references through the [Model Context Protocol](https://modelcontextprotocol.io/).

## Features

- **Self-hosted** - Your docs stay on your infrastructure
- **Semantic Search** - Natural language queries with vector embeddings
- **MCP Native** - Works with Cursor, Windsurf, Claude Desktop out of the box
- **Fast** - Cloudflare Workers edge deployment
- **Fully Configurable** - Simple YAML configuration, no code changes needed
- **Easily extendable** - Add new parsers and chunkers or modify existing ones with ease

## How It Works

ContextMCP follows a simple workflow:

1. **Configure** - Define your documentation sources in `config.yaml`
2. **Index** - Run `npm run reindex` to fetch, parse, and embed your docs
3. **Deploy** - Deploy the Cloudflare Worker to serve search requests
4. **Connect** - Configure your AI assistant to use the MCP server

The system:

- Fetches documentation from GitHub, local files, or URLs
- Parses MDX, Markdown, or OpenAPI formats
- Chunks content intelligently for optimal retrieval
- Generates embeddings using OpenAI
- Stores vectors in Pinecone for fast semantic search
- Serves results via MCP protocol and REST API

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/dodopayments/contextmcp.git
cd contextmcp
npm install
```

### 2. Configure

Copy the example configuration:

```bash
cp config.example.yaml config.yaml
cp .env.example .env
```

Edit `config.yaml` to define your documentation sources (see [Configuration](#configuration) below).

Add your API keys to `.env`:

```bash
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
GITHUB_TOKEN=ghp_...  # Optional: for private repos
```

### 3. Index Your Documentation

```bash
npm run reindex
```

This will:

- Fetch all configured sources
- Parse and chunk the documentation
- Generate embeddings
- Upload to Pinecone

### 4. Deploy

```bash
cd cloudflare-worker
npm install
npm run deploy
```

See [Deployment](#deployment) for detailed instructions.

## Configuration

ContextMCP uses a single `config.yaml` file for all configuration. The configuration is validated using Zod schemas, so you'll get clear error messages if something is misconfigured.

### Complete Configuration Reference

```yaml
# =============================================================================
# VECTOR DATABASE
# =============================================================================
vectordb:
  provider: pinecone
  # Index name in Pinecone (will be created if doesn't exist)
  indexName: my-company-docs
  # Optional: Use namespaces to separate environments
  namespace: production
  pinecone:
    cloud: aws # Options: aws, gcp, azure
    region: us-east-1

# =============================================================================
# EMBEDDINGS
# =============================================================================
embeddings:
  provider: openai
  model: text-embedding-3-large # OpenAI embedding model
  dimensions: 3072 # Must match model dimensions

# =============================================================================
# DOCUMENTATION SOURCES
# =============================================================================
sources:
  # Each source defines where to get docs and how to parse them
  - name: docs # Unique identifier (lowercase, hyphens only)
    displayName: 'API Documentation' # Human-readable name
    type: github # Source type: github, local, or url
    repository: owner/repo # GitHub repo (for github type)
    branch: main # Git branch (default: main)
    path: content/docs/ # Path within repo (default: .)
    parser: mdx # Parser: mdx, markdown, or openapi
    baseUrl: https://docs.example.com # Base URL for source links
    language: typescript # Optional: programming language context
    optional: false # Optional: don't fail if source missing
    skipDirs: # Directories to skip
      - node_modules
      - .git
      - images
    skipFiles: # Files to skip (case-insensitive)
      - LICENSE
      - README.md
    # OpenAPI-specific options
    urlMappingDir: api-reference # Directory with MDX files for URL mapping

# =============================================================================
# REINDEXING SETTINGS
# =============================================================================
reindex:
  clearBeforeReindex: true # Clear all vectors before reindexing
  batchSize: 100 # Batch size for embeddings (1-500)

# =============================================================================
# CHUNKING SETTINGS
# =============================================================================
chunking:
  maxChunkSize: 2000 # Maximum characters per chunk (100-10000)
  minChunkSize: 250 # Minimum characters for standalone chunk (50-5000)
  idealChunkSize: 1000 # Target size for merging small sections (100-5000)
```

See config.example.yaml for more details.

### Source Types

#### GitHub Sources

Fetch documentation from GitHub repositories:

```yaml
- name: docs
  type: github
  repository: owner/repo
  branch: main # Optional, default: main
  path: content/docs/ # Optional, default: .
  parser: mdx
  baseUrl: https://docs.example.com
```

**Required fields:**

- `repository` - GitHub repository in `owner/repo` format

**Optional fields:**

- `branch` - Git branch (default: `main`)
- `path` - Path within repository (default: `.`)
- `baseUrl` - Base URL for generating source links
- `skipDirs` - Array of directory names to skip
- `skipFiles` - Array of file names to skip (case-insensitive)
- `optional` - If `true`, won't fail if repository is inaccessible

#### Local Sources

Use local filesystem paths (useful for development):

```yaml
- name: local-docs
  type: local
  localPath: ./docs/
  parser: markdown
  optional: true # Don't fail if path doesn't exist
```

**Required fields:**

- `localPath` - Path to documentation directory

#### URL Sources

Download documentation from a URL:

```yaml
- name: api-spec
  type: url
  url: https://api.example.com/openapi.yaml
  parser: openapi
  baseUrl: https://docs.example.com/api-reference
```

**Required fields:**

- `url` - URL to fetch from

### Parser Types

#### MDX Parser

For documentation with JSX components (Mintlify, Fumadocs, Docusaurus, etc.):

```yaml
- name: docs
  parser: mdx
  baseUrl: https://docs.example.com
```

**Features:**

- Handles `<Tab>`, `<Tabs>`, `<Callout>`, `<Card>` components
- Auto-detects Mintlify vs Fumadocs patterns
- Preserves code blocks and examples
- Combines tabs when content fits within chunk size
- Splits oversized sections intelligently

**Supported frameworks:**

- Mintlify
- Fumadocs
- Docusaurus
- Nextra
- Any MDX-based documentation

#### Markdown Parser

For plain markdown files (README, CHANGELOG, etc.):

```yaml
- name: sdk-typescript
  parser: markdown
  language: typescript
```

**Features:**

- Hierarchical section parsing
- Smart merging of small sections
- Automatic file type detection (README, CHANGELOG, MIGRATION)
- Code block preservation
- Changelog version grouping

**Best for:**

- SDK documentation
- README files
- CHANGELOG files
- Migration guides
- Plain markdown documentation

#### OpenAPI Parser

For OpenAPI/Swagger specifications:

```yaml
- name: api-spec
  parser: openapi
  baseUrl: https://docs.example.com/api-reference
  urlMappingDir: api-reference # Optional: for URL mapping
```

**Required fields:**

- `baseUrl` - Base URL for API documentation links

**Features:**

- Parses OpenAPI 3.x specifications (YAML or JSON)
- Generates endpoint documentation chunks
- Extracts code samples from `x-codeSamples`
- URL mapping from MDX frontmatter (optional)
- Schema-based example generation

**URL Mapping:**
If you have MDX files with `openapi:` frontmatter, set `urlMappingDir` to map API endpoints to documentation URLs:

```yaml
- name: api-spec
  type: github
  repository: owner/repo
  path: openapi
  parser: openapi
  baseUrl: https://docs.example.com/api-reference
  urlMappingDir: api-reference # Directory with MDX files
```

### Chunking Configuration

Control how documentation is split into chunks:

```yaml
chunking:
  maxChunkSize: 2000 # Maximum characters per chunk
  minChunkSize: 250 # Minimum for standalone chunk
  idealChunkSize: 1000 # Target for merging small sections
```

**Recommendations:**

- **maxChunkSize**: 1500-2500 characters (optimal for RAG)
- **minChunkSize**: 200-500 characters (prevents tiny chunks)
- **idealChunkSize**: 800-1200 characters (target for merging)

Research shows 128-512 tokens (~500-2000 characters) is optimal for semantic search precision.

### Environment Variables

| Variable           | Required | Description                              |
| ------------------ | -------- | ---------------------------------------- |
| `OPENAI_API_KEY`   | ✅       | OpenAI API key for generating embeddings |
| `PINECONE_API_KEY` | ✅       | Pinecone API key for vector storage      |
| `GITHUB_TOKEN`     | ❌       | GitHub token for private repositories    |

You can also use environment variable substitution in `config.yaml`:

```yaml
vectordb:
  indexName: ${PINECONE_INDEX_NAME:-my-default-index}
```

## Reindexing

### Full Reindex

Reindex all sources:

```bash
npm run reindex
```

Or using the script directly:

```bash
npx tsx scripts/reindex.ts
```

### Single Source

Reindex only a specific source:

```bash
npx tsx scripts/reindex.ts --source docs
```

### Dry Run

Parse and chunk without uploading to Pinecone:

```bash
npm run reindex:dry
# or
npx tsx scripts/reindex.ts --dry-run
```

This is useful for:

- Testing configuration changes
- Verifying parsing works correctly
- Inspecting generated chunks (saved to `data/chunks-index.json`)

### Custom Config File

Use a different config file:

```bash
npx tsx scripts/reindex.ts --config test.config.yaml
```

### Reindex Options

The reindex script supports:

- `--source, -s <name>` - Reindex only the specified source
- `--config, -c <path>` - Use a custom config file
- `--dry-run` - Parse only, don't upload to Pinecone
- `--help, -h` - Show help message

## Deployment

### Cloudflare Workers

1. **Install Wrangler:**

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Configure Worker:**

   Edit `cloudflare-worker/wrangler.jsonc`:

   ```jsonc
   {
     "name": "contextmcp",
     "compatibility_date": "2024-01-01",
     "vars": {
       "SERVER_NAME": "my-company-docs",
       "SERVER_DESCRIPTION": "My Company Documentation Search",
     },
   }
   ```

3. **Set Secrets:**

   ```bash
   cd cloudflare-worker
   wrangler secret put OPENAI_API_KEY
   wrangler secret put PINECONE_API_KEY
   ```

4. **Deploy:**

   ```bash
   npm run deploy
   ```

5. **Verify:**

   Visit `https://your-worker.your-subdomain.workers.dev` to see the landing page.

### Environment Variables

The Cloudflare Worker uses these environment variables:

| Variable             | Description                               |
| -------------------- | ----------------------------------------- |
| `OPENAI_API_KEY`     | OpenAI API key (required)                 |
| `PINECONE_API_KEY`   | Pinecone API key (required)               |
| `SERVER_NAME`        | Server name (default: `contextmcp`)       |
| `SERVER_DESCRIPTION` | Server description (shown in MCP clients) |

Set `SERVER_NAME` and `SERVER_DESCRIPTION` in `wrangler.jsonc` or as secrets.

## Client Setup

### Cursor

Add to `~/.cursor/mcp.json` (or `%APPDATA%\Cursor\User\mcp.json` on Windows):

```json
{
  "mcpServers": {
    "my-docs": {
      "url": "https://your-worker.your-subdomain.workers.dev/mcp"
    }
  }
}
```

Restart Cursor to load the MCP server.

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "my-docs": {
      "serverUrl": "https://your-worker.your-subdomain.workers.dev/mcp"
    }
  }
}
```

Restart Windsurf to load the MCP server.

### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-docs": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://your-worker.your-subdomain.workers.dev/mcp"]
    }
  }
}
```

Restart Claude Desktop to load the MCP server.

## REST API

ContextMCP exposes a REST API for direct integration:

### Search Endpoint

**GET Request:**

```bash
curl "https://your-worker.workers.dev/search?query=how+to+authenticate&limit=5"
```

**POST Request:**

```bash
curl -X POST "https://your-worker.workers.dev/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to authenticate",
    "limit": 5
  }'
```

### Response Format

```json
{
  "results": [
    {
      "documentTitle": "Authentication Guide",
      "heading": "API Authentication",
      "content": "To authenticate with the API...",
      "sourceUrl": "https://docs.example.com/auth",
      "method": "POST",
      "path": "/v1/auth",
      "language": "typescript",
      "score": 0.92
    }
  ],
  "total": 1,
  "query": "how to authenticate"
}
```

### Query Parameters

| Parameter  | Type   | Default | Description                    |
| ---------- | ------ | ------- | ------------------------------ |
| `query`    | string | -       | Search query (required)        |
| `limit`    | number | 10      | Number of results (1-50)       |
| `minScore` | number | 0.7     | Minimum similarity score (0-1) |

### Health Check

```bash
curl "https://your-worker.workers.dev/health"
```

Returns:

```json
{
  "status": "ok",
  "service": "contextmcp",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## How It Works (Technical Details)

### Architecture

```
┌─────────────┐
│   Sources   │  GitHub, Local, URL
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Parsers   │  MDX, Markdown, OpenAPI
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Chunkers  │  Split into optimal sizes
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Embeddings  │  OpenAI text-embedding-3-large
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Pinecone   │  Vector storage & search
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Worker    │  Cloudflare Workers (MCP + REST)
└─────────────┘
```

### Parsing Process

1. **Source Fetching:**
   - GitHub: Clones repository to temporary directory
   - Local: Reads from filesystem
   - URL: Downloads and caches file

2. **Parsing:**
   - MDX: Extracts frontmatter, cleans JSX components, splits by headings
   - Markdown: Parses hierarchical structure, handles special files (CHANGELOG, etc.)
   - OpenAPI: Extracts endpoints, schemas, and code samples

3. **Chunking:**
   - Splits content by semantic boundaries (headings, sections)
   - Respects `maxChunkSize`, `minChunkSize`, and `idealChunkSize`
   - Combines small related sections
   - Preserves code blocks and examples

4. **Embedding:**
   - Generates embeddings using OpenAI's `text-embedding-3-large` model
   - Batches requests for efficiency
   - Handles rate limits and retries

5. **Storage:**
   - Uploads vectors to Pinecone with metadata
   - Uses namespaces for environment separation (optional)
   - Indexes by document, category, and language

### Chunking Strategy

The chunking system is designed for optimal RAG retrieval:

- **Semantic Boundaries:** Splits at heading boundaries, not arbitrary positions
- **Size Optimization:** Combines small sections, splits large ones
- **Context Preservation:** Includes parent headings and metadata
- **Code Preservation:** Keeps code blocks intact within chunks

### Search Process

1. User submits query via MCP or REST API
2. Query is embedded using the same OpenAI model
3. Vector similarity search in Pinecone
4. Results are reranked for better relevance
5. Top results returned with metadata

## Project Structure

```
contextmcp/
├── src/
│   ├── config/              # Configuration schema and loader
│   │   ├── schema.ts        # Zod validation schemas
│   │   ├── loader.ts        # YAML loading with env substitution
│   │   └── constants.ts     # Shared constants
│   ├── sources/             # Source fetchers
│   │   ├── github.ts        # GitHub repository cloning
│   │   ├── local.ts         # Local filesystem
│   │   ├── url.ts           # URL downloading
│   │   └── index.ts         # Source router
│   ├── parser/              # Documentation parsers
│   │   ├── chunkers/        # Format-specific parsers
│   │   │   ├── mdx-chunker.ts      # MDX/JSX parser
│   │   │   ├── markdown-chunker.ts # Markdown parser
│   │   │   ├── openapi-parser.ts   # OpenAPI parser
│   │   │   └── openapi-router.ts   # OpenAPI router
│   │   ├── core/            # Shared utilities
│   │   │   ├── config.ts    # Chunking configuration
│   │   │   ├── section-utils.ts    # Section splitting/merging
│   │   │   └── text-utils.ts      # Text cleaning
│   │   └── index.ts         # Parser router
│   ├── embeddings/          # Embedding utilities
│   │   └── core.ts          # Pinecone/OpenAI integration
│   └── types/               # TypeScript types
│       └── index.ts         # Core type definitions
├── cloudflare-worker/       # Cloudflare Workers deployment
│   ├── src/
│   │   └── index.ts         # Worker entry point
│   ├── wrangler.jsonc       # Worker configuration
│   └── package.json
├── scripts/                 # Utility scripts
│   ├── reindex.ts          # Main reindexing script
│   ├── clean-vectors.ts    # Clean Pinecone index
│   └── index-to-txt.ts     # Export chunks to text
├── config.yaml              # Main configuration (create from example)
├── config.example.yaml     # Example configuration
├── .env.example             # Example environment variables
└── package.json
```

## Troubleshooting

### Reindexing Issues

**Problem:** "Configuration file not found"

**Solution:** Make sure `config.yaml` exists in the project root, or use `--config` flag.

**Problem:** "Source 'xyz' not found"

**Solution:** Check that the source exists and is accessible. For GitHub sources, verify the repository name and that `GITHUB_TOKEN` is set if it's private.

**Problem:** "No MDX/MD files found"

**Solution:** Check the `path` field in your source configuration. It should point to the directory containing your documentation files.

### Deployment Issues

**Problem:** "Worker failed to start"

**Solution:** Verify all secrets are set:

```bash
wrangler secret list
```

**Problem:** "Pinecone index not found"

**Solution:** The index will be created automatically on first reindex. Make sure `PINECONE_API_KEY` is set correctly.

### Search Issues

**Problem:** "No results returned"

**Solution:**

1. Verify the index has been populated: `npm run reindex`
2. Check `minScore` setting - try lowering it
3. Verify the query is being embedded correctly

**Problem:** "Results not relevant"

**Solution:**

1. Adjust `minScore` to filter out low-quality matches
2. Check chunk sizes - may need to adjust `maxChunkSize`
3. Verify source content is being parsed correctly

### Performance

**Problem:** "Reindexing is slow"

**Solution:**

1. Increase `reindex.batchSize` (up to 500)
2. Use `--source` flag to reindex only changed sources
3. Consider using `clearBeforeReindex: false` for incremental updates

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code style and formatting
- Testing guidelines
- Pull request process
- Development setup

## Credits

Built with:

- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol for AI assistant integration
- [Pinecone](https://pinecone.io/) - Vector database for semantic search
- [OpenAI](https://openai.com/) - Embedding generation
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment platform

---

<p align="center">
  <strong>ContextMCP</strong> - Self-hosted MCP for your documentation<br>
  <a href="https://github.com/dodopayments/contextmcp">GitHub</a> • <a href="https://modelcontextprotocol.io/">MCP Docs</a>
</p>
