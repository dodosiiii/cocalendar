FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm install && npm install --prefix client && npm install --prefix server

COPY client ./client
COPY server ./server

RUN npm run build --prefix client

WORKDIR /app/server

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
