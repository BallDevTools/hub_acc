# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
RUN corepack enable pnpm && corepack prepare pnpm@10.28.2 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# ใช้ร่วมกันสำหรับ api, worker และ migrate
# เก็บ dev dependency ไว้ เพราะรัน TypeScript ด้วย tsx และ migrate ด้วย Prisma CLI
FROM deps AS app
ENV NODE_ENV=production
USER node
WORKDIR /repo/apps/api
CMD ["node_modules/.bin/tsx", "src/server.ts"]

FROM deps AS web-build
ENV NEXT_STANDALONE=true NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:4000
RUN pnpm --filter @hub/web build

FROM node:24-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
CMD ["node", "apps/web/server.js"]
