FROM node:20-alpine

# Install FFmpeg (statically linked from alpine repo; includes libx264, aac, etc.)
RUN apk add --no-cache \
    ffmpeg \
    && ffmpeg -version

# Create a non-root user for sandboxed execution
RUN addgroup -S hubworker && adduser -S hubworker -G hubworker

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Switch to non-root
USER hubworker

# Temp directory for transcoding scratch files (mounted as volume)
ENV TRANSCODE_TMP=/tmp/transcode

CMD ["node", "src/index.js"]
