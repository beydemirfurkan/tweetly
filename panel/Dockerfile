FROM node:20-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN cp -r .next/standalone/tweetly/panel/. /app/standalone-out/ && \
    cp -r .next/static /app/standalone-out/.next/static && \
    cp -r public /app/standalone-out/public 2>/dev/null; true


FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/standalone-out ./

EXPOSE 3000

CMD ["node", "server.js"]
