# ---- Build stage ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Dummy URL so the prisma generate postinstall hook doesn't require a real DB at
# build time (generate never connects). The real URL is injected at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# node_modules carries the generated Prisma client + the prisma CLI used by
# `migrate deploy` at container start.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Apply pending migrations, then boot. Fails fast if the DB is unreachable.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
