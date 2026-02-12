# World Monitor - Self-Hosted Setup Guide

This is a self-hosted version of World Monitor running entirely on your Mac Mini.

## Quick Start

```bash
./start.sh
```

Then open http://localhost:3000 in your browser.

## Architecture

The setup consists of four components:

1. **Redis** (localhost:6379) - Local caching layer
2. **API Server** (port 5175) - Wraps Vercel Edge Functions as Express routes
3. **Intelligence API** (port 5174) - Aggregates signals/macro/CII data every 5 minutes
4. **Vite Dev Server** (port 3000) - Frontend dashboard

## What Works Without API Keys

These features work immediately with no configuration:

- ✅ RSS news feeds (BBC, Guardian, NPR, Al Jazeera, etc.)
- ✅ Cryptocurrency data (CoinGecko - no auth required)
- ✅ Hacker News
- ✅ Earthquake monitoring (USGS)
- ✅ Market data (Yahoo Finance via proxy)
- ✅ GitHub trending
- ✅ ArXiv papers
- ✅ FAA flight status
- ✅ World Bank data
- ✅ Polymarket predictions

## Optional API Keys (Add to `.env.local`)

To enable additional features, sign up for these free APIs and add to `.env.local`:

```bash
# AI Summaries (https://console.groq.com/)
GROQ_API_KEY=your_key_here

# Stock Market Data (https://finnhub.io/)
FINNHUB_API_KEY=your_key_here

# Cloud Redis Caching (https://upstash.com/)
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

## Intelligence API Endpoints

The aggregated intelligence API runs on port 5174:

- `GET /signals` - Active correlation signals
- `GET /macro` - 7-signal BTC radar (macro indicators)
- `GET /cii` - Country Instability Index scores
- `GET /brief` - AI world brief (requires GROQ_API_KEY)
- `GET /all` - All data combined
- `GET /health` - Health check + last update time

Data refreshes automatically every 5 minutes.

## Directory Structure

```
worldmonitor/
├── api/                    # Original Vercel Edge Functions (don't modify)
├── server/                 # Local server wrappers (our additions)
│   ├── index.js           # Express server wrapping all api/*.js files
│   └── intelligence-api.js # Intelligence aggregation server
├── src/                    # Frontend source code
├── logs/                   # Server logs
│   ├── api.log            # Main API server
│   └── intelligence.log   # Intelligence API
├── .env.local             # Environment variables (optional API keys)
├── start.sh               # Startup script
└── vite.config.ts         # Vite config (includes proxy to local API)
```

## Troubleshooting

### Dashboard won't load
- Check that all servers are running: `ps aux | grep node`
- Check logs: `tail -f logs/api.log`
- Test API directly: `curl http://localhost:5175/health`

### No data showing
- Some panels require API keys (check console for errors)
- RSS feeds and crypto should work immediately
- Test a known working endpoint: `curl http://localhost:5175/api/coingecko`

### Port conflicts
- Change ports in `server/index.js` (API), `server/intelligence-api.js` (Intel), or `vite.config.ts` (frontend)
- Default ports: 5175 (API), 5174 (Intelligence), 3000 (Frontend)

### Redis connection errors
- Check Redis is running: `brew services list | grep redis`
- Restart Redis: `brew services restart redis`

## Manual Start (without script)

```bash
# 1. Start Redis
brew services start redis

# 2. Start API server
node server/index.js &

# 3. Start Intelligence API
node server/intelligence-api.js &

# 4. Start frontend
npm run dev
```

## Stopping Services

Press `Ctrl+C` in the terminal where `start.sh` is running, or:

```bash
# Kill all Node processes (nuclear option)
killall node

# Stop Redis
brew services stop redis
```

## Development

- Frontend changes hot-reload automatically (Vite)
- API changes require restarting `server/index.js`
- To add new data sources, check the `api/` folder for examples

## Tech Stack

- **Frontend**: Vite, D3.js, Deck.gl, MapLibre GL
- **Backend**: Express.js wrapping Vercel Edge Functions
- **Caching**: Redis (local or Upstash)
- **APIs**: 40+ routes proxying to external data sources

## Resources

- Original repo: https://github.com/koala73/worldmonitor
- Groq API: https://console.groq.com/
- Finnhub: https://finnhub.io/
- Upstash Redis: https://upstash.com/
