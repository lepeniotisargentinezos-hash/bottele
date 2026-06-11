#!/bin/sh
set -e

echo "Aplicando migrations..."
npx prisma migrate deploy

echo "Iniciando aplicação..."
exec node dist/app.js
