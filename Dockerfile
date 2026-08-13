FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/tests/fixtures/northstar-interim1 ./tests/fixtures/northstar-interim1
COPY --from=build /app/tests/golden/northstar-interim1 ./tests/golden/northstar-interim1
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/cloudRun.ts"]
