# ReelPilot in one image: the web app (`npm run start`, the default) and the
# job worker (`npm run worker`) share dependencies, Chrome and fonts.
# Exports render with HyperFrames in Chrome Headless Shell.
#
#   docker build -t reelpilot .
#   docker compose -f deploy/local/compose.yml up      # the local stack
#
# The worker runs with tsx (a dev dependency), so every dependency is
# installed. ffmpeg/ffprobe come from npm; Chrome from `hyperframes browser
# ensure`.
#
# Layers up to `hyperframes browser ensure` download ~1 GB (Debian packages,
# npm, Chrome): change them only when needed, since any edit above a layer
# (even reordering ENV) rebuilds everything below it.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    # Server renders: no telemetry or update checks from the HyperFrames CLI.
    HYPERFRAMES_NO_TELEMETRY=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    HYPERFRAMES_SKIP_SKILLS=1 \
    NEXT_TELEMETRY_DISABLED=1

# Fonts with Vietnamese glyphs (Noto) and emoji, for text the brand kit's
# font can't draw; certificates for S3 and AI providers.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

# Everything below runs as the unprivileged node user (rendering runs
# Chrome); files are owned by it as they arrive.
WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first (cached while only source changes). postinstall runs
# `prisma generate`, which needs the schema and config.
COPY --chown=node:node package.json package-lock.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npm ci --include=dev --no-audit --no-fund

# Chrome's system libraries need root (Playwright keeps the list for
# Debian); Chrome Headless Shell itself goes into node's own cache.
USER root
RUN npx playwright install-deps chromium && rm -rf /var/lib/apt/lists/*
USER node
RUN npx hyperframes browser ensure

COPY --chown=node:node . .

# `next build` validates the environment and inlines NEXT_PUBLIC_*: it
# builds with placeholders (deploy/build.env); the real values come at run
# time. NEXT_PUBLIC_APP_URL must be the address people open.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3300
RUN set -a && . ./deploy/build.env && set +a \
 && NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
