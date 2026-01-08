# Contributing to ContextMCP

Thank you for your interest in contributing to ContextMCP! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/context-mcp.git
   cd context-mcp
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/dodopayments/context-mcp.git
   ```

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git

### Installation

```bash
# Install all dependencies
npm install

# Build all packages
npm run build:cli
```

### Development Commands

```bash
# Run website locally
npm run dev:website

# Watch CLI for changes
npm run dev:cli

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

## Project Structure

```
context-mcp/
├── packages/
│   ├── cli/              # CLI scaffolding tool (npm package)
│   ├── template/         # Project template (scaffolded to users)
│   └── website/          # Documentation website
└── deployments/
    └── dodopayments/     # Example deployment configuration
```

### Package Descriptions

- **`packages/cli`**: The `contextmcp` CLI tool for scaffolding new projects
- **`packages/template`**: Template files that get copied when users run `npx contextmcp init`
- **`packages/website`**: Next.js documentation site

## Making Changes

### Branch Naming

Create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
# or
git checkout -b docs/your-docs-update
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example:
```
feat: add support for custom chunk sizes in markdown parser
```

### Before Submitting

1. **Ensure tests pass** (if applicable)
2. **Run type checking**: `npm run typecheck`
3. **Run linting**: `npm run lint`
4. **Format code**: `npm run format`
5. **Update documentation** if needed

## Submitting Changes

### Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Push your branch**:
   ```bash
   git push origin your-branch-name
   ```

3. **Create a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Fill out the pull request template
   - Reference any related issues
   - Add screenshots or examples if applicable

4. **Respond to feedback**: Be open to suggestions and make requested changes

### Pull Request Guidelines

- Keep PRs focused and reasonably sized
- One feature or fix per PR
- Ensure all CI checks pass
- Request review from maintainers when ready

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Prefer `interface` over `type` for object shapes
- Avoid `any` - use proper types or `unknown`
- Use meaningful variable and function names

### Code Style

- Follow existing code patterns
- Use functional programming patterns where appropriate
- Keep functions small and focused
- Add comments for complex logic

### File Organization

- Group related functionality together
- Export from index files when appropriate
- Keep file sizes reasonable

## Testing

When adding new features or fixing bugs:

1. Test your changes locally
2. Test edge cases
3. Ensure backward compatibility when possible
4. Update tests if applicable

## Documentation

### Code Documentation

- Add JSDoc comments for public APIs
- Document complex algorithms or business logic
- Keep comments up-to-date with code changes

### User Documentation

- Update README.md if adding new features
- Update website docs in `packages/website/content/docs/`
- Add examples for new features

## Questions?

If you have questions or need help:

- Open an issue for discussion
- Check existing issues and discussions
- Review the documentation at [contextmcp.ai/docs](https://contextmcp.ai/docs)

## Recognition

Contributors will be recognized in:
- Release notes
- Project documentation
- GitHub contributors list

Thank you for contributing to ContextMCP! 🎉

