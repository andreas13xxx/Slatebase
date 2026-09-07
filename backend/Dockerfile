# Slatebase Backend — Production Dockerfile
# Multi-stage: build TypeScript, then run compiled JavaScript

# --- Build Stage ---
# NOTE: the build context is the repo ROOT (see .github/workflows/release.yml
# and docker-compose), not ./backend — the backend depends on the sibling
# `shared-contracts/` package (a file:../shared-contracts dependency with its
# own tsc build step). All COPY paths are therefore prefixed with backend/ or
# shared-contracts/, and the two are laid out as siblings under /src so the
# `file:../shared-contracts` relative path resolves inside the image.
FROM node:22-slim AS build

# argon2 requires build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Build the shared-contracts package first: install its own devDependencies
# (zod, typescript) and emit dist/, which backend's `npm ci` links into
# node_modules and `tsc` resolves `@slatebase/shared-contracts` against.
WORKDIR /src/shared-contracts
COPY shared-contracts/package.json shared-contracts/package-lock.json ./
RUN npm ci
COPY shared-contracts/tsconfig.json ./
COPY shared-contracts/src/ ./src/
RUN npm run build

# Install backend dependencies (the file:../shared-contracts link resolves to
# the sibling package built above).
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy source and compile
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./
RUN npx tsc

# --- Production Stage ---
FROM node:22-slim AS production

# python3/make/g++ are only needed to compile argon2 and are purged below.
# git + openssh-client are needed at runtime by the git-sync module (shells
# out to the native `git` binary; ssh is used for SSH-key remotes) and stay
# in the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# `putFileBodySchema` from @slatebase/shared-contracts is imported at RUNTIME,
# so the package (with its compiled dist/) must be present as the sibling the
# file:../shared-contracts link points at when `npm ci` resolves it.
COPY --from=build /src/shared-contracts/package.json /src/shared-contracts/package-lock.json /app/shared-contracts/
COPY --from=build /src/shared-contracts/dist/ /app/shared-contracts/dist/

WORKDIR /app/backend

# Install production dependencies only.
# --install-links copies the file:../shared-contracts package into node_modules
# instead of symlinking it. With a symlink, Node resolves the real path and
# would look for `zod` (which shared-contracts imports at runtime) starting from
# /app/shared-contracts, where it isn't — a copy under backend/node_modules
# resolves zod from backend's own dependencies. It also makes copy-vs-symlink
# deterministic across npm versions (observed to differ locally).
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --install-links && rm -rf /root/.npm

# Remove build tools after argon2 is compiled (git/openssh-client stay — see above)
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy compiled JavaScript from build stage
COPY --from=build /src/backend/dist/ ./dist/

# Copy config
COPY backend/config/ ./config/

# Copy version file (updated by Release Please)
COPY backend/version.json ./version.json

# Create data directory (will be overridden by volume mount)
RUN mkdir -p ./data

# Copy welcome vault templates (static assets, independent of data volume)
COPY backend/assets/ ./assets/

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
