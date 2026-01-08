# ContextMCP

<p align="center">
  <a href="https://discord.gg/bYqAp4ayYh">
    <img src="https://img.shields.io/discord/1305511580854779984?label=Join%20Discord&logo=discord" alt="Join Discord" />
  </a>
  <a href="https://twitter.com/dodopayments">
    <img src="https://img.shields.io/twitter/follow/dodopayments?label=Follow&style=social" alt="Twitter Follow" />
  </a>
  <img src="https://img.shields.io/github/license/dodopayments/context-mcp" alt="License" />
</p>

**Self-hosted MCP server for your documentation.** Index your documentation from across the sources and serve it via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and REST API.

## Quick Start

```bash
# Scaffold a new project
npx contextmcp init my-docs-mcp

# Follow the prompts, then:
cd my-docs-mcp
npm install

# Configure your API keys
cp .env.example .env
# Edit .env with your PINECONE_API_KEY and OPENAI_API_KEY

# Configure your documentation sources
# Edit config.yaml

# Index your documentation
npm run reindex

# Edit the cloudflare-worker
# Deploy the MCP server
cd cloudflare-worker
npm install
npm run deploy
```

## What is ContextMCP?

ContextMCP creates a searchable knowledge base from your documentation that AI assistants can query via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

### Supported Content Types

| Parser     | Content Types         | Examples                       |
| ---------- | --------------------- | ------------------------------ |
| `mdx`      | MDX/JSX documentation | Mintlify, Fumadocs, Docusaurus |
| `markdown` | Plain Markdown files  | READMEs, CHANGELOGs            |
| `openapi`  | OpenAPI/Swagger specs | API reference docs             |

### How It Works

1. **Parse** - Extract content from your docs, APIs, and READMEs
2. **Chunk** - Split into semantic chunks optimized for search
3. **Embed** - Generate embeddings using OpenAI
4. **Store** - Upload to Pinecone vector database
5. **Search** - Query via MCP from AI assistants

## Repository Structure

```
contextmcp/
├── packages/
│   ├── cli/              # npx contextmcp (npm package)
│   ├── template/         # Project template (scaffolded to users)
│   └── website/          # contextmcp.ai documentation site
└── deployments/
    └── dodopayments/     # Dodo Payments specific deployment
```

## Packages

| Package             | Description          | Published            |
| ------------------- | -------------------- | -------------------- |
| `packages/cli`      | CLI scaffolding tool | ✅ npm: `contextmcp` |
| `packages/template` | Project template     | (copied by CLI)      |
| `packages/website`  | Documentation site   | (deployed to Vercel) |

## Development

### Prerequisites

- Node.js 18+

### Setup

```bash
# Install all dependencies
npm install

# Development
npm run dev:website     # Run website locally
npm run dev:cli         # Watch CLI for changes

# Build
npm run build:website   # Build website
npm run build:cli       # Build CLI

# Type checking
npm run typecheck       # Check all packages
```

## Documentation

Visit [contextmcp.ai/docs](https://contextmcp.ai/docs) for full documentation.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
