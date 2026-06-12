# Slatebase Backend — Production Dockerfile
# Multi-stage: build TypeScript, then run compiled JavaScript

# --- Build Stage ---
FROM node:22-slim AS build

# argon2 requires build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies (including devDependencies for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

# --- Production Stage ---
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && rm -rf /root/.npm

# Remove build tools after argon2 is compiled
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy compiled JavaScript from build stage
COPY --from=build /app/dist/ ./dist/

# Copy config
COPY config/ ./config/

# Copy version file (updated by Release Please)
COPY version.json ./version.json

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

# Run compiled JavaScript
CMD ["node", "dist/index.js"]
