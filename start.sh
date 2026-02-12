#!/bin/bash
# World Monitor - Local Development Startup Script

set -e

echo "🌍 Starting World Monitor..."

# Start Redis (if not already running)
if ! brew services list | grep -q "redis.*started"; then
  echo "📦 Starting Redis..."
  brew services start redis
fi

# Kill any existing World Monitor processes
lsof -ti:5175 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
lsof -ti:5176 | xargs kill -9 2>/dev/null || true

# Start API server in background
echo "🚀 Starting API server on port 5175..."
node server/index.js > logs/api.log 2>&1 &
API_PID=$!
echo "   API server PID: $API_PID"

# Start Intelligence API server
echo "🧠 Starting Intelligence API on port 5174..."
node server/intelligence-api.js > logs/intelligence.log 2>&1 &
INTEL_PID=$!
echo "   Intelligence API PID: $INTEL_PID"

# Wait for API server to be ready
sleep 3

# Start Vite dev server on port 5176 (3000 is TeslaMate Grafana)
echo "🎨 Starting Vite dev server on port 5176..."
npx vite --port 5176 &
VITE_PID=$!
echo "   Vite server PID: $VITE_PID"

echo ""
echo "✅ World Monitor is running!"
echo ""
echo "   🌐 Dashboard:      http://localhost:5176"
echo "   🔌 API:            http://localhost:5175"
echo "   🧠 Intelligence:   http://localhost:5174"
echo "   💾 Redis:          localhost:6379"
echo ""
echo "   📊 Logs:"
echo "      API:            logs/api.log"
echo "      Intelligence:   logs/intelligence.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Trap Ctrl+C to cleanup
trap "echo ''; echo 'Stopping services...'; kill $API_PID $INTEL_PID $VITE_PID 2>/dev/null; exit 0" INT TERM

# Wait for both processes
wait
