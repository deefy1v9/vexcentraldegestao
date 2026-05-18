#!/bin/sh
set -e

echo "Running Prisma db push..."
node node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma

echo "Starting server..."
exec node server.js
