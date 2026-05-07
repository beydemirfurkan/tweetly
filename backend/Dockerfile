FROM node:26-bookworm-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
# eslint-plugin-import hasn't shipped eslint@10 peer support yet; use
# legacy resolution so npm ci doesn't bail. Build doesn't invoke lint,
# so runtime is unaffected.
RUN npm ci --legacy-peer-deps

COPY src ./src
RUN npm run build


FROM node:26-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Istanbul \
    NODE_ENV=production \
    NEST_PORT=3000 \
    HEADLESS=true \
    DATA_DIR=/data/app-data \
    USER_DATA_DIR=/data/user-data \
    PLAYWRIGHT_BROWSERS_PATH=/app/browsers

# System libraries Patchright/Chromium needs at runtime. We don't install
# google-chrome-stable: Patchright ships its own anti-detection Chromium
# fork and `npx patchright install chromium` downloads it below.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation tzdata wget \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
      libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 \
      libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libxshmfence1 \
    && ln -fs /usr/share/zoneinfo/$TZ /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Pull Patchright's bundled Chromium into the image. Do not place browser
# binaries under /data: Coolify mounts /data as a volume and would hide files
# installed during image build.
RUN mkdir -p /app/browsers /data/user-data /data/app-data/errors /data/app-data/logs \
    && npx patchright install chromium

COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${NEST_PORT}/health || exit 1

CMD ["node", "dist/main.js"]
