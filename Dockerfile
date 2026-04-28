FROM node:20-alpine AS base
WORKDIR /app

# ── Install dependencies ───────────────────────────────────────────────────────
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ── Build frontend ─────────────────────────────────────────────────────────────
COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy compiled frontend + server
COPY --from=base /app/dist ./dist
COPY --from=base /app/server ./server
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/public ./public

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3002

CMD ["node", "server/index.cjs"]
