# Slatebase Frontend — Multi-stage Production Dockerfile
# Stage 1: Build the React SPA with Vite
# Stage 2: Serve static files with Nginx

# --- Build Stage ---
# Pinned to the *builder's* architecture, not the target's. This stage only
# emits static HTML/CSS/JS, which is identical whatever platform produced it,
# so running it under QEMU for the linux/arm64 leg buys nothing and costs a
# lot: rolldown's minify pass ("rendering chunks") on this bundle — ~3.6 MB
# plus mermaid, katex, cytoscape and codemirror — went from seconds natively
# to over an hour emulated, while `tsc -b` alone took ~2.5 minutes.
#
# The nginx stage below stays target-native, so the published images are still
# genuine per-architecture builds.
#
# Note this is the opposite of backend/Dockerfile, which must build per target:
# argon2 is compiled natively there, so its output really is arch-specific.
#
# Pinned by digest, not just the `24-slim` tag, so two builds of the same
# commit produce the same image — see backend/Dockerfile for how to update it.
# Same Node major as backend/Dockerfile and CI, kept in sync deliberately (see
# CI's node-version and backend's engines field) even though this stage has no
# native addon of its own to tie it to a specific build.
FROM --platform=$BUILDPLATFORM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build

# Release version (e.g. "v0.37.0"), passed by CI. Vite embeds any VITE_-prefixed
# env var present at build time into the bundle via import.meta.env — this is how
# the running frontend knows its own version, to compare against the backend's
# (see useVersionInfo.ts) and warn if they came from different releases.
ARG SLATEBASE_VERSION=development
ENV VITE_APP_VERSION=$SLATEBASE_VERSION

# NOTE: the build context is the repo ROOT (see .github/workflows/release.yml
# and docker-compose), not ./frontend — the frontend type-imports the sibling
# `shared-contracts/` package (a file:../shared-contracts dependency with its
# own tsc build step). COPY paths are prefixed with frontend/ or
# shared-contracts/, and the two sit as siblings under /src so the
# `file:../shared-contracts` relative path resolves inside the image. The nginx
# production stage below serves only the static bundle, so shared-contracts is
# a build-stage concern only.

# Build the shared-contracts package first: install its own devDependencies
# (zod, typescript) and emit dist/, which the frontend's `npm ci` links into
# node_modules and `tsc -b` resolves `@slatebase/shared-contracts` against.
WORKDIR /src/shared-contracts
COPY shared-contracts/package.json shared-contracts/package-lock.json ./
RUN npm ci
COPY shared-contracts/tsconfig.json ./
COPY shared-contracts/src/ ./src/
RUN npm run build

WORKDIR /src/frontend

# Install dependencies first (layer caching). The file:../shared-contracts link
# resolves to the sibling package built above.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source files
COPY frontend/src/ ./src/
COPY frontend/public/ ./public/
COPY frontend/index.html ./
COPY frontend/vite.config.ts ./
COPY frontend/tsconfig.json ./
COPY frontend/tsconfig.app.json ./
COPY frontend/tsconfig.node.json ./
COPY frontend/eslint.config.js ./

# Build production bundle. The prebuild hook (npm run build:contracts) rebuilds
# shared-contracts idempotently — harmless here since it was already built above.
RUN npm run build

# --- Production Stage ---
# Pinned by digest — see the node:24-slim note above for why and how to update.
FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3 AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/slatebase.conf
COPY frontend/security-headers.conf /etc/nginx/security-headers.conf

# Copy built frontend assets
COPY --from=build /src/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
