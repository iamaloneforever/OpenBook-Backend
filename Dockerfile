FROM node:26-alpine AS base

WORKDIR /app

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM base AS test
ENV NODE_ENV=test
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["sh", "-c", "npm run test && npm run test:e2e"]

FROM builder AS production-deps
RUN npm prune --omit=dev --ignore-scripts

FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
RUN mkdir -p /app/uploads && chown node:node /app/uploads
EXPOSE 5000
USER node
CMD ["node", "--enable-source-maps", "dist/main.js"]
