# ContextMCP self-hostable Node.js server
# Multi-stage build: install + compile, then run a slim production image.

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (including dev deps needed to compile TypeScript).
# Copy the lockfile and use `npm ci` for reproducible, lockfile-pinned installs.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies (reproducible via the lockfile).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output.
COPY --from=build /app/dist ./dist

# Run as the non-root `node` user the base image already ships (uid/gid 1000),
# not root - limits the blast radius if the process (or a dependency) is ever
# compromised. `npm ci` above must run as root to write into /app; chown
# happens after so the app itself runs unprivileged.
RUN chown -R node:node /app
USER node

# The server listens on PORT (default 8787).
EXPOSE 8787

# Basic healthcheck against the /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
