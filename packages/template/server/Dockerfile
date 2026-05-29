# ContextMCP self-hostable Node.js server
# Multi-stage build: install + compile, then run a slim production image.

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (including dev deps needed to compile TypeScript).
COPY package.json ./
RUN npm install

# Compile TypeScript to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies.
COPY package.json ./
RUN npm install --omit=dev

# Copy compiled output.
COPY --from=build /app/dist ./dist

# The server listens on PORT (default 8787).
EXPOSE 8787

# Basic healthcheck against the /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
