FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
COPY public/ public/

# Data directory for SQLite (mounted as volume on Fly.io)
RUN mkdir -p /app/data

EXPOSE 3001
ENV DATA_DIR=/app/data
CMD ["node", "index.js"]
