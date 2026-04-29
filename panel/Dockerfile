FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./tweetly/panel/.next/static
COPY --from=builder /app/public ./tweetly/panel/public

EXPOSE 3000

CMD ["node", "tweetly/panel/server.js"]
