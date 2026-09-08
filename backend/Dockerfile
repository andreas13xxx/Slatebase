# Slatebase Backend — Production Dockerfile
# Multi-stage: build TypeScript, then run compiled JavaScript

# --- Build Stage ---
# NOTE: the build context is the repo ROOT (see .github/workflows/release.yml
# and docker-compose), not ./backend — the backend depends on the sibling
# `shared-contracts/` package (a file:../shared-contracts dependency with its
# own tsc build step). All COPY paths are therefore prefixed with backend/ or
# shared-contracts/, and the two are laid out as siblings under /src so the
# `file:../shared-contracts` relative path resolves inside the image.
#
# Pinned by digest, not just the `24-slim` tag, so two builds of the same
# commit produce the same image instead of silently drifting when Docker Hub
# repoints the tag. To update: pull the new tag, read its digest off the pull
# output (or `docker buildx imagetools inspect node:24-slim`), and paste it in
# below for both the build and production stages — they must match (see the
# argon2 note in the production stage).
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build

# argon2 requires build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Build the shared-contracts package first: install its own devDependencies
# (zod, typescript) and emit dist/, which backend's `npm ci` links into
# node_modules and `tsc` resolves `@slatebase/shared-contracts` against.
# Pruned back down to {package.json, package-lock.json, dist/} afterward — the
# same minimal shape the production stage used to assemble by hand — so the
# `--install-links` copy below (which packs this whole directory) doesn't drag
# shared-contracts' own devDependencies or TS sources into the backend image.
WORKDIR /src/shared-contracts
COPY shared-contracts/package.json shared-contracts/package-lock.json ./
RUN npm ci
COPY shared-contracts/tsconfig.json ./
COPY shared-contracts/src/ ./src/
RUN npm run build
RUN rm -rf node_modules src tsconfig.json README.md

# Install backend dependencies (the file:../shared-contracts link resolves to
# the sibling package built above).
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy source and compile
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./
RUN npx tsc

# Production-only install, done here rather than in the production stage: this
# stage already has the C++ toolchain argon2's native addon needs (see above),
# so compiling it a second time in production — and installing/purging the
# same toolchain there just to do it — would only add image weight.
# --install-links copies the file:../shared-contracts package into
# node_modules instead of symlinking it. With a symlink, Node resolves the
# real path and would look for `zod` (which shared-contracts imports at
# runtime) starting from /src/shared-contracts — a copy under
# backend/node_modules resolves zod from backend's own dependencies instead.
# It also makes copy-vs-symlink deterministic across npm versions (observed to
# differ locally).
RUN npm ci --omit=dev --install-links && rm -rf /root/.npm

# --- Production Stage ---
# Must match the build stage's Node major and glibc base exactly — argon2's
# native addon, compiled/staged above, is ABI-tied to both.
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS production

# git + openssh-client are needed at runtime by the git-sync module (shells
# out to the native `git` binary; ssh is used for SSH-key remotes).
# No C++ toolchain here: argon2 was already compiled in the build stage above.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Production node_modules (including the compiled argon2 addon and the linked
# shared-contracts package) built in the build stage above — see the note
# there. shared-contracts itself doesn't need to exist separately in this
# image: --install-links already copied what backend needs into node_modules.
COPY --from=build /src/backend/node_modules ./node_modules

# package.json only, not package-lock.json: no install runs in this stage, but
# Node still needs the nearest package.json's "type": "module" field to load
# dist/index.js as ESM.
COPY backend/package.json ./

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
