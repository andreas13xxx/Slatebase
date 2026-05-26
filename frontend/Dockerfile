# Slatebase Frontend — Multi-stage Production Dockerfile
# Stage 1: Build the React SPA with Vite
# Stage 2: Serve static files with Nginx

# --- Build Stage ---
FROM node:22-slim AS build

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
