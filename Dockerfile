# UPR OS Dockerfile
# Uses Debian-based Node image for native dependency support (canvas)
# Alpine is NOT allowed for UPR OS builds due to canvas compilation requirements

FROM node:20-bullseye AS builder

WORKDIR /app

# Install system dependencies for canvas and other native modules
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy source code
COPY . .

# Create empty directories for optional content (ensures COPY won't fail)
RUN mkdir -p ml dashboard/dist

# Build dashboard if it exists (optional)
RUN if [ -d "dashboard" ] && [ -f "dashboard/package.json" ]; then \
      cd dashboard && npm ci --legacy-peer-deps && npm run build; \
    else \
      echo "No dashboard directory found, skipping dashboard build"; \
    fi

# Production stage
FROM node:20-bullseye-slim AS runtime

WORKDIR /app

# Install runtime dependencies for canvas
RUN apt-get update && apt-get install -y \
  libcairo2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libjpeg62-turbo \
  libgif7 \
  librsvg2-2 \
  dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Copy built application from builder (core required files)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/instrument.js ./instrument.js
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/services ./services
COPY --from=builder /app/server ./server
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/jobs ./jobs
COPY --from=builder /app/db ./db
COPY --from=builder /app/os ./os

# Copy optional directories (created empty in builder if they don't exist)
COPY --from=builder /app/ml ./ml
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Create non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

# Phase 1.5: GIT_COMMIT for Sales-Bench trace code_commit_sha field
# Set at build time via: docker build --build-arg GIT_COMMIT=$(git rev-parse HEAD) .
# Or via Cloud Build substitution
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
