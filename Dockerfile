FROM node:22-alpine AS base

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Setup common build stage
FROM base AS builder
WORKDIR /app

# Build arguments for environment variables
# VITE_WS_URL intentionally omitted — the client uses window.location.origin
# so it works correctly behind any proxy (nginx, Cloudflare Tunnel, local IP)
ARG VITE_API_URL=/api

# Pass build args to environment
ENV VITE_API_URL=$VITE_API_URL

# Install build dependencies for sqlite3
RUN apk add --no-cache python3 make g++ 

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy both packages
COPY packages/server ./packages/server/
COPY packages/client ./packages/client/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build both applications
RUN pnpm --filter "@excalidraw-persist/server" build
RUN pnpm --filter "@excalidraw-persist/client" build

# Setup server production stage
FROM base AS server
WORKDIR /app

# Install build dependencies for sqlite3
RUN apk add --no-cache python3 make g++

# Copy package.json files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/server/package.json ./packages/server/

# Install production dependencies only and rebuild sqlite3
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Copy built JavaScript files
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Create src directory structure and copy schema file
RUN mkdir -p /app/src/lib
COPY --from=builder /app/packages/server/src/lib/schema.sql ./src/lib/

# Create directory for SQLite database
RUN mkdir -p /app/data

# Setup client files
FROM nginx:alpine AS client
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/http.d/default.conf

# Final combined image
FROM alpine:latest

# Install Node.js and Nginx
RUN apk add --no-cache nodejs nginx supervisor

# Set up directories
RUN mkdir -p /app /app/data /var/log/supervisor

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy server files
COPY --from=server /app /app
# Copy client files
COPY --from=client /usr/share/nginx/html /usr/share/nginx/html
COPY --from=client /etc/nginx/http.d/default.conf /etc/nginx/http.d/default.conf

# Set environment variables
ENV PORT=4000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Expose ports
EXPOSE 80 4000

# Start supervisord to manage both services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"] 
