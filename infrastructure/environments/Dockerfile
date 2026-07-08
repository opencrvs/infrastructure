FROM node:22.20.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./
RUN corepack enable \
  && yarn install --frozen-lockfile --ignore-scripts \
  && yarn cache clean

COPY infrastructure/environments ./infrastructure/environments

ENV ENVIRONMENT_INIT_UI_HOST=0.0.0.0 \
  ENVIRONMENT_INIT_UI_PUBLIC_HOST=127.0.0.1 \
  ENVIRONMENT_INIT_UI_PORT=3000 \
  ENVIRONMENT_INIT_UI_OPEN_BROWSER=false \
  ENVIRONMENT_INIT_UI_CONTAINER=true \
  OPENCRVS_REPOSITORY_PATH=/repo \
  TS_NODE_PROJECT=/app/tsconfig.json

EXPOSE 3000
VOLUME ["/repo"]
WORKDIR /repo

CMD ["node", "-r", "/app/node_modules/ts-node/register", "/app/infrastructure/environments/ui-server.ts"]
