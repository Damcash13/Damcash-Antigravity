FROM node:20-alpine AS base
WORKDIR /app

# Copy prisma schema FIRST so @prisma/client postinstall can find it
COPY prisma ./prisma
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ── Build frontend ─────────────────────────────────────────────────────────────
COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

# Copy prisma schema BEFORE npm ci (needed for @prisma/client postinstall)
COPY prisma ./prisma
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy compiled frontend + server
COPY --from=base /app/dist ./dist
COPY --from=base /app/server ./server
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["node", "server/index.cjs"]
