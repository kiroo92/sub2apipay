#!/bin/sh
set -e

echo "Running database migrations..."
PRISMA_BIN=$(find node_modules/.pnpm -path '*/prisma/build/index.js' -type f | head -1)

if [ -z "$PRISMA_BIN" ]; then
  echo "Error: Prisma CLI not found; database migrations were not applied." >&2
  exit 1
fi

node "$PRISMA_BIN" migrate deploy --config prisma.config.ts
echo "Migrations complete."

echo "Starting application..."
exec node server.js
