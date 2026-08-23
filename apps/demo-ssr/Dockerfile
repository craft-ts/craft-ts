FROM node:20-bookworm-slim AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run demo:ssr:production

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4300

COPY --from=build /workspace/dist/apps /app/dist/apps

EXPOSE 4300
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4300) + '/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/apps/demo-ssr/server/server.js"]
