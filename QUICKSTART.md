# World Monitor - Quick Reference

## 🚀 Start Everything
```bash
cd ~/clawd/oss/worldmonitor
./start.sh
```

## 🌐 Access Points
- **Dashboard**: http://localhost:3000
- **API Server**: http://localhost:5175/health
- **Intelligence API**: http://localhost:5174/health
- **Redis**: localhost:6379

## 🧪 Test Endpoints
```bash
# Crypto prices (no key needed)
curl http://localhost:5175/api/coingecko | jq .

# Hacker News
curl 'http://localhost:5175/api/hackernews?limit=5' | jq '.stories[].title'

# Macro signals
curl http://localhost:5174/macro | jq '.data.verdict'

# All intelligence data
curl http://localhost:5174/all | jq keys
```

## 📊 Data Refresh Schedule
- Intelligence API: Every 5 minutes (auto)
- Dashboard: Real-time as you navigate

## 🛑 Stop Everything
Press `Ctrl+C` in the start.sh terminal, or:
```bash
killall node
brew services stop redis
```

## 📝 View Logs
```bash
tail -f logs/api.log
tail -f logs/intelligence.log
```

## ⚡️ What Works Now (No Keys Needed)
✅ News feeds (30+ sources)  
✅ Crypto prices (CoinGecko)  
✅ Hacker News  
✅ Earthquakes (USGS)  
✅ GitHub trending  
✅ Market data (Yahoo Finance)  
✅ Macro signals  
✅ Country intelligence  

## 🔑 Optional (Add Keys to `.env.local`)
- GROQ_API_KEY → AI summaries
- FINNHUB_API_KEY → Stock data
- UPSTASH_REDIS_REST_URL/TOKEN → Cloud caching

See `SETUP.md` for full documentation.
