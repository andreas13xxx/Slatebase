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
FROM --platform=$BUILDPLATFORM node:22-slim AS build

# Release version (e.g. "v0.37.0"), passed by CI. Vite embeds any VITE_-prefixed
# env var present at build time into the bundle via import.meta.env — this is how
# the running frontend knows its own version, to compare against the backend's
# (see useVersionInfo.ts) and warn if they came from different releases.
ARG SLATEBASE_VERSION=development
ENV VITE_APP_VERSION=$SLATEBASE_VERSION

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.app.json ./
COPY tsconfig.node.json ./
COPY eslint.config.js ./

# Build production bundle
RUN npm run build

# --- Production Stage ---
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/slatebase.conf

# Copy built frontend assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
