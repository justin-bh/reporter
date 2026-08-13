#!/bin/sh
set -e

echo "reporter: applying database migrations..."
node_modules/.bin/prisma migrate deploy --schema apps/server/prisma/schema.prisma

echo "reporter: starting server on port ${PORT:-8080}..."
exec node apps/server/dist/index.js
