# ContextMCP CLI

CLI tool to scaffold self-hosted MCP servers for your documentation. Create a searchable knowledge base from your docs that AI assistants can query via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and REST API.

<p align="left">
  <a href="https://www.npmjs.com/package/contextmcp">
    <img src="https://img.shields.io/npm/v/contextmcp?label=npm&logo=npm" alt="npm version" />
  </a>
  <a href="https://discord.gg/bYqAp4ayYh">
    <img src="https://img.shields.io/discord/1305511580854779984?label=Join%20Discord&logo=discord" alt="Join Discord" />
  </a>
</p>

## Installation

```bash
# Run directly with npx (recommended)
npx contextmcp init my-docs-mcp

# Or install globally
npm install -g contextmcp
contextmcp init my-docs-mcp
```

## Usage

### Initialize a New Project

```bash
npx contextmcp init [project-name]
```

The `init` command scaffolds a new ContextMCP project with everything you need to index your documentation and deploy an MCP server.

#### Interactive Mode

```bash
npx contextmcp init
```

Running without a project name will prompt you to enter one interactively.

### Command Options

| Option         | Description                  |
| -------------- | ---------------------------- |
| `--no-install` | Skip automatic `npm install` |

### Example

```bash
# Create a new project
npx contextmcp init my-docs-mcp

# Navigate to project
cd my-docs-mcp

# Configure environment
cp .env.example .env
# Edit .env with your PINECONE_API_KEY and OPENAI_API_KEY

# Configure documentation sources
# Edit config.yaml to add your GitHub repos, docs, APIs

# Index your documentation
npm run reindex

# Deploy the MCP server
cd cloudflare-worker
npm install
npm run deploy
```

## What Gets Scaffolded

When you run `contextmcp init`, you get a complete project structure:

```
my-docs-mcp/
├── src/
│   ├── parser/           # Document parsers (MDX, Markdown, OpenAPI)
│   ├── embeddings/       # OpenAI embedding generation
│   ├── sources/          # Source fetchers (GitHub, local, URL)
│   ├── config/           # Config schema and loader
│   └── types/            # TypeScript types
├── cloudflare-worker/    # MCP server deployment
├── scripts/              # Reindex and utility scripts
├── config.yaml           # Your configuration
├── config.example.yaml   # Example configuration
├── .env.example          # Environment template
└── package.json
```

## Supported Content Types

| Parser     | Content Types         | Examples                       |
| ---------- | --------------------- | ------------------------------ |
| `mdx`      | MDX/JSX documentation | Mintlify, Fumadocs, Docusaurus |
| `markdown` | Plain Markdown files  | READMEs, CHANGELOGs            |
| `openapi`  | OpenAPI/Swagger specs | API reference docs             |

## Requirements

- **Node.js 18+** is required
- **Pinecone account** for vector storage
- **OpenAI API key** for embeddings
- **Cloudflare account** for deployment (optional, for MCP server)

## How It Works

1. **Parse** - Extract content from your docs, APIs, and READMEs
2. **Chunk** - Split into semantic chunks optimized for search
3. **Embed** - Generate embeddings using OpenAI
4. **Store** - Upload to Pinecone vector database
5. **Search** - Query via MCP from AI assistants

## Documentation

For full documentation, visit [contextmcp.ai/docs](https://contextmcp.ai/docs)

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/dodopayments/context-mcp) for contribution guidelines.

## Related

- [ContextMCP](https://github.com/dodopayments/context-mcp) - Main repository
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

## License

MIT
