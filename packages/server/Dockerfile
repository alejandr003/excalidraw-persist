FROM node:22-alpine AS base

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Setup build stage
FROM base AS build
WORKDIR /app

# Install build dependencies for sqlite3
RUN apk add --no-cache python3 make g++ 

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy server package
COPY packages/server ./packages/server/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build the application
RUN pnpm --filter "@excalidraw-persist/server" build

# Setup production stage
FROM base AS production
WORKDIR /app

# Install build dependencies for sqlite3
RUN apk add --no-cache python3 make g++

# Copy package.json files
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/server/package.json ./packages/server/

# Install production dependencies only and rebuild sqlite3
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Copy built JavaScript files
COPY --from=build /app/packages/server/dist ./packages/server/dist

# Create src directory structure and copy schema file
RUN mkdir -p /app/src/lib
COPY --from=build /app/packages/server/src/lib/schema.sql ./src/lib/

# Create directory for SQLite database
RUN mkdir -p /app/data

# Set environment variables
ENV PORT=4000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "packages/server/dist/index.js"] 
