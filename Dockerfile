FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/
RUN npm install --prefix client --omit=dev && npm install --prefix server --omit=dev

COPY client ./client
COPY server ./server
RUN npm run build --prefix client

FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist
COPY --from=build /app/server/node_modules /app/server/node_modules

ENV NODE_ENV=production
EXPOSE 3001

USER appuser
CMD ["node", "server/server.js"]
