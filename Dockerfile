FROM node:20-alpine AS build

WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm ci --prefix client && npm ci --prefix server --omit=dev

COPY client ./client
COPY server ./server
RUN npm run build --prefix client

FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    apk add --no-cache curl

WORKDIR /app
COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist
COPY --from=build /app/server/node_modules /app/server/node_modules

RUN chown -R appuser:appgroup /app/server

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

USER appuser
CMD ["node", "server/server.js"]
