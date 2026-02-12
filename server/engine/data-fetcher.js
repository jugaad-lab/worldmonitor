/**
 * Data Fetcher - Fetch data from local API server (port 5175)
 */

import { FEEDS, SOURCE_TIERS } from './config/feeds.js';

const API_BASE = 'http://localhost:5175';

/**
 * Parse RSS XML to extract items
 */
function parseRSSXML(xml) {
  const items = [];
  
  // Simple regex-based extraction (good enough for most RSS feeds)
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXML = match[1];
    
    const titleMatch = titleRegex.exec(itemXML);
    const linkMatch = linkRegex.exec(itemXML);
    const pubDateMatch = pubDateRegex.exec(itemXML);
    
    if (titleMatch && linkMatch) {
      items.push({
        title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
        link: linkMatch[1].trim(),
        pubDate: pubDateMatch ? pubDateMatch[1] : new Date().toISOString(),
      });
    }
  }
  
  return items;
}

/**
 * Fetch RSS news from all feeds
 */
export async function fetchRSSNews() {
  const allItems = [];
  
  for (const feed of FEEDS) {
    try {
      const url = `${API_BASE}/api/rss-proxy?url=${encodeURIComponent(feed.url)}`;
      const res = await fetch(url, { 
        signal: AbortSignal.timeout(10000) // 10 second timeout per feed
      });
      
      if (!res.ok) {
        console.warn(`⚠️  ${feed.name} failed: ${res.status}`);
        continue;
      }
      
      const xml = await res.text();
      const items = parseRSSXML(xml);
      
      for (const item of items) {
        allItems.push({
          source: feed.name,
          title: item.title,
          link: item.link,
          pubDate: new Date(item.pubDate),
          isAlert: false,
          tier: feed.tier,
        });
      }
    } catch (error) {
      console.warn(`⚠️  ${feed.name} fetch error:`, error.message);
    }
  }
  
  return allItems;
}

/**
 * Fetch market data (stocks, commodities, crypto)
 */
export async function fetchMarketData() {
  const markets = [];
  
  // Fetch CoinGecko data (crypto) - no API key required
  try {
    const res = await fetch(`${API_BASE}/api/coingecko`, { 
      signal: AbortSignal.timeout(10000) 
    });
    if (res.ok) {
      const data = await res.json();
      
      // CoinGecko API returns object keyed by crypto name: { bitcoin: {...}, ethereum: {...} }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const cryptoMap = {
          'bitcoin': { symbol: 'BTC-USD', name: 'Bitcoin' },
          'ethereum': { symbol: 'ETH-USD', name: 'Ethereum' },
          'solana': { symbol: 'SOL-USD', name: 'Solana' },
        };
        
        for (const [key, info] of Object.entries(cryptoMap)) {
          if (data[key]?.usd) {
            markets.push({
              symbol: info.symbol,
              name: info.name,
              display: info.name,
              price: data[key].usd,
              change: data[key].usd_24h_change || null,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('⚠️  CoinGecko fetch failed:', err.message);
  }
  
  // Try Finnhub (requires API key, may not be configured)
  try {
    const res = await fetch(`${API_BASE}/api/finnhub?symbols=AAPL,MSFT,NVDA,GOOGL,AMZN,META,TSLA`, { 
      signal: AbortSignal.timeout(10000) 
    });
    if (res.ok) {
      const data = await res.json();
      if (data.error) {
        // API key not configured, skip
      } else if (Array.isArray(data)) {
        markets.push(...data.map(m => ({
          symbol: m.symbol,
          name: m.name || m.symbol,
          display: m.name || m.symbol,
          price: m.c || null,
          change: m.dp || null,
        })));
      }
    }
  } catch (err) {
    // Finnhub may not be configured, that's OK
  }
  
  return markets;
}

/**
 * Fetch Polymarket prediction markets
 */
export async function fetchPredictionMarkets() {
  try {
    const res = await fetch(`${API_BASE}/api/polymarket`);
    if (!res.ok) throw new Error(`Polymarket fetch failed: ${res.status}`);
    
    const data = await res.json();
    
    if (!Array.isArray(data)) return [];
    
    return data.map(p => ({
      title: p.question || p.title || '',
      yesPrice: p.outcomePrices?.[0] * 100 || 50,
      volume: p.volume || 0,
    }));
  } catch (error) {
    console.error('❌ Failed to fetch prediction markets:', error.message);
    return [];
  }
}

/**
 * Fetch macro signals (from macro-signals API)
 */
export async function fetchMacroSignals() {
  try {
    const res = await fetch(`${API_BASE}/api/macro-signals`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn('⚠️  Macro signals unavailable:', error.message);
    return null;
  }
}

/**
 * Fetch country instability scores
 */
export async function fetchCountryInstability() {
  try {
    const res = await fetch(`${API_BASE}/api/country-intel`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn('⚠️  Country instability unavailable:', error.message);
    return null;
  }
}

/**
 * Helper: get source tier
 */
export function getSourceTier(source) {
  // Check direct match first
  if (SOURCE_TIERS[source]) return SOURCE_TIERS[source];
  
  // Check partial match
  for (const [key, tier] of Object.entries(SOURCE_TIERS)) {
    if (source.includes(key) || key.includes(source)) {
      return tier;
    }
  }
  
  return 3; // Default tier
}
