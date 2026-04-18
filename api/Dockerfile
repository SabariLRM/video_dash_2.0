FROM node:20-alpine

RUN addgroup -S hubapi && adduser -S hubapi -G hubapi

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

USER hubapi

EXPOSE 4000

# Use node itself for healthcheck — avoids needing curl/wget in the image
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
