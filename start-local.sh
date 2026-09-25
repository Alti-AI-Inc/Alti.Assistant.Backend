#!/bin/bash
echo "🚀 Booting Aphura Autonomous AI Platform..."

echo "📦 Starting Local Infrastructure (Memgraph, Redis, Postgres, Jaeger)..."
docker compose up -d

echo "⏳ Waiting for databases to initialize..."
sleep 5

echo "⚙️ Starting Backend Server..."
npm run dev &
BACKEND_PID=$!

echo "🌐 Starting Next.js Frontend..."
cd ../
npm run dev &
FRONTEND_PID=$!

echo "✅ System is live! Frontend running on localhost:3000"
echo "Press Ctrl+C to shutdown."

trap "kill $BACKEND_PID $FRONTEND_PID; docker compose stop; exit" SIGINT SIGTERM
wait
