FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.js ./
COPY server/public/ public/

# The root index.html is the single source of truth for the homepage.
# Copy it into the served public/ dir so the deployed site always matches
# what the team edits at the repo root (no divergence with a public/ copy).
COPY index.html public/index.html

# Data directory for SQLite (mounted as volume on Fly.io)
RUN mkdir -p /app/data

EXPOSE 3001
ENV DATA_DIR=/app/data
CMD ["node", "index.js"]
