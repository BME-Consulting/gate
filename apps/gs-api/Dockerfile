# Multi-stage build for GS API

# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
COPY pnpm-lock.yaml* ./
RUN npm install -g pnpm@9.15.4 && \
    pnpm install --no-frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# ==========================================
# Stage 2: Production
# ==========================================
FROM node:22-slim

WORKDIR /app

# Install runtime dependencies (OpenSSL for Prisma) and build tools (for better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package*.json ./
COPY pnpm-lock.yaml* ./
RUN npm install -g pnpm@9.15.4 && \
    pnpm install --no-frozen-lockfile --prod

# Copy Prisma schema and generate client
COPY --from=builder /app/prisma ./prisma
RUN npx prisma@5.22.0 generate

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user (Debian syntax)
RUN groupadd --gid 1001 --system nodejs && \
    useradd --uid 1001 --system --gid nodejs --shell /bin/false nodejs

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 7070

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7070/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
