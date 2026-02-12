# World Monitor Correlation Engine (Server-Side)

**Status:** ✅ Operational (as of 2026-02-12)

## Overview

The correlation engine extracts intelligence by analyzing cross-domain patterns across news, markets, and prediction markets. It runs server-side in Node.js (no browser required) and refreshes every 5 minutes.

## Architecture

```
server/
├── engine/
│   ├── config/
│   │   ├── entities.js        # 600+ entity registry (stocks, crypto, indices)
│   │   └── feeds.js            # RSS feed configuration
│   ├── services/
│   │   ├── clustering.js       # News similarity clustering (Jaccard)
│   │   ├── entity-extraction.js # Extract entities from headlines
│   │   ├── entity-index.js     # Fast entity lookup indexes
│   │   └── correlation.js      # Signal detection algorithms
│   ├── utils/
│   │   └── analysis-constants.js # Thresholds, weights, helpers
│   ├── data-fetcher.js         # Fetch from API server (port 5175)
│   └── correlation-engine.js   # Main orchestrator
└── intelligence-api.js         # REST API server (port 5174)
```

## Signal Types Detected

1. **Explained Market Move** — Market moves correlated with news
   - Example: `Ethereum -2.1% — "Iran, xAI re-org, deficit warnings"`
   
2. **Silent Divergence** — Market moves WITHOUT correlated news (insider trading?)
   - Example: `Solana -3.5% with no correlated headlines`
   
3. **Pipeline Flow Drop** — Pipeline disruption keywords detected
4. **Flow-Price Divergence** — Pipeline issues vs energy commodity prices
5. **Prediction Leads News** — Prediction market shifts with related headlines
6. **Velocity Spike** — Unusual news volume on a topic

## Intelligence Pipeline

1. **Fetch Data** (from API server port 5175):
   - RSS news from 8 feeds (BBC, Guardian, Al Jazeera, CNBC, TechCrunch, etc.)
   - Crypto prices (CoinGecko)
   - Prediction markets (Polymarket)
   - Macro signals & country instability scores

2. **Cluster News** — Group similar headlines using Jaccard similarity (0.5 threshold)

3. **Extract Entities** — Match headlines to 600+ entities (companies, indices, crypto, commodities)

4. **Detect Signals** — Run 6 correlation detectors across news, markets, predictions

5. **Build Correlations** — Match market moves to entity mentions in news

6. **Detect Focal Points** — Find geographic/topic convergence zones

7. **Cache Results** — Store in memory, served via REST API

## API Endpoints (Port 5174)

- **GET /signals** — Correlation signals with confidence scores
- **GET /correlations** — Market-news entity matches
- **GET /entities** — Top extracted entities from news
- **GET /focal-points** — Convergence zones
- **GET /clusters** — Top news clusters
- **GET /all** — Everything combined
- **GET /health** — Health check + stats

## Example Output

### /signals
```json
{
  "id": "sig-1770868840337-naeo6c",
  "type": "explained_market_move",
  "title": "Ethereum moves down with news",
  "description": "Ethereum -2.1% — \"'Nothing definitive' reached about Iran...\"",
  "confidence": 0.95,
  "data": {
    "marketChange": -2.1,
    "correlatedNews": ["Iran Netanyahu Trump visit", "xAI re-org", ...],
    "correlatedEntities": ["ETH-USD"]
  }
}
```

### /entities
```json
{
  "entityId": "GOOGL",
  "name": "Alphabet Inc.",
  "mentionCount": 9,
  "avgConfidence": 0.76
}
```

## Current Performance

- **News items fetched:** 172
- **Market data points:** 3 (BTC, ETH, SOL)
- **News clusters:** 167
- **Extracted entities:** 14
- **Correlation signals:** 2
- **Pipeline runtime:** ~2-6 seconds
- **Refresh interval:** 5 minutes

## Usage

### Start the engine:
```bash
cd ~/clawd/oss/worldmonitor
node server/intelligence-api.js
```

### Test endpoints:
```bash
curl http://localhost:5174/signals
curl http://localhost:5174/correlations
curl http://localhost:5174/all
```

### Cron job integration:
```bash
# Fetch intelligence every 5 minutes
*/5 * * * * curl -s http://localhost:5174/all > /tmp/worldmonitor-intel.json
```

## TODO / Future Enhancements

- [ ] Add threat classification (keyword-based)
- [ ] Add hotspot escalation scoring
- [ ] Add anomaly detection (needs historical baseline)
- [ ] Add sector cascade detection
- [ ] Add military surge detection
- [ ] Integrate Yahoo Finance for stock data (no API key required)
- [ ] Add Redis caching for persistence
- [ ] Add more RSS feeds (currently 8, can scale to 50+)
- [ ] Add geolocation extraction from news
- [ ] Add sentiment analysis

## Porting Notes

All code ported from TypeScript (`src/services/`) to plain JavaScript (`server/engine/`):

- ✅ No browser dependencies (DOM, window, document)
- ✅ Pure Node.js ES modules
- ✅ Stateless functions (easy to test)
- ✅ No external state (except in-memory cache)

Original TypeScript files preserved in `src/` — never modified.
