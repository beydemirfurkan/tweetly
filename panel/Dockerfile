FROM node:20-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN SERVERJS=$(find .next/standalone -name "server.js" -not -path "*/node_modules/*" | head -1) && \
    SERVERDIR=$(dirname "$SERVERJS") && \
    echo "Found server.js at $SERVERJS" && \
    mkdir -p /app/standalone-out && \
    cp -r "$SERVERDIR/." /app/standalone-out/ && \
    STATICDIR=$(find .next/standalone -path "*/.next/static" -type d | head -1) && \
    echo "Found static at $STATICDIR" && \
    rm -rf /app/standalone-out/.next/static && \
    mkdir -p /app/standalone-out/.next && \
    cp -r "$STATICDIR" /app/standalone-out/.next/static && \
    cp -r public /app/standalone-out/public 2>/dev/null; true


FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/standalone-out ./

EXPOSE 3000

CMD ["node", "server.js"]
