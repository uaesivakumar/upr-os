FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install --only=production
COPY . .

WORKDIR /app/dashboard
RUN npm ci || npm install --no-audit --no-fund
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
RUN apk add --no-cache dumb-init

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/instrument.js ./instrument.js
COPY --from=build /app/routes ./routes
COPY --from=build /app/utils ./utils
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/workers ./workers
COPY --from=build /app/services ./services
COPY --from=build /app/ml ./ml
COPY --from=build /app/server ./server
COPY --from=build /app/jobs ./jobs
COPY --from=build /app/db ./db
COPY --from=build /app/dashboard/dist ./dashboard/dist

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
