# Slatebase Backend — Production Dockerfile
# Node.js 22 with native TypeScript stripping (no build step needed)

FROM node:22-slim AS base

# argon2 requires build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and config
COPY src/ ./src/
COPY config/ ./config/

# Create data directory (will be overridden by volume mount)
RUN mkdir -p ./data

# Non-root user for security
RUN addgroup --system slatebase && adduser --system --ingroup slatebase slatebase
RUN chown -R slatebase:slatebase /app
USER slatebase

# Default environment variables
ENV SLATEBASE_PORT=3000
ENV SLATEBASE_HOST=0.0.0.0
ENV SLATEBASE_LOG_LEVEL=info
ENV NODE_ENV=production

EXPOSE 3000

# Start with native TypeScript stripping (Node.js 22+)
CMD ["node", "--experimental-strip-types", "src/index.ts"]
