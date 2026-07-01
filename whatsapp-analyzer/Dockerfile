# Multi-stage build: build web + server, run server (serves built web).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY core/package.json core/
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:core && npm run build:web && npm run build -w server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Copy only what's needed to run.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/core/dist ./core/dist
COPY --from=build /app/core/package.json ./core/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/web/dist ./web/dist
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "server/dist/index.js"]
