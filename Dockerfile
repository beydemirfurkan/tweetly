FROM node:20-bookworm-slim AS panel-builder

WORKDIR /panel

COPY panel/package*.json ./
RUN npm ci

COPY panel/ ./
RUN npm run build


FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build


FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Istanbul \
    NODE_ENV=production \
    NEST_PORT=3000 \
    HEADLESS=true \
    DATA_DIR=/data/app-data \
    USER_DATA_DIR=/data/user-data

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates fonts-liberation tzdata \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
      libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 \
      libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libxshmfence1 \
    && wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && ln -fs /usr/share/zoneinfo/$TZ /etc/localtime && dpkg-reconfigure -f noninteractive tzdata \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=panel-builder /panel/out ./panel-static

RUN mkdir -p /data/user-data /data/app-data/errors /data/app-data/logs

EXPOSE 3000

CMD ["node", "dist/main.js"]
