# ==========================================
# STAGE 1: Build & Compile
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source code
COPY src ./src/

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --production

# ==========================================
# STAGE 2: Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Add curl for container health check
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=4000

# Create non-root system user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy runtime files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Fix ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start server (runs database migration if needed before server starts)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
