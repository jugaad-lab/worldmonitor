/**
 * Correlation Engine - Main orchestrator
 * Runs the full intelligence pipeline: fetch data, cluster news, extract entities, detect signals
 */

import {
  fetchRSSNews,
  fetchMarketData,
  fetchPredictionMarkets,
  fetchMacroSignals,
  fetchCountryInstability,
  getSourceTier,
} from './data-fetcher.js';

import { clusterNews } from './services/clustering.js';
import { extractEntitiesFromClusters, getTopEntitiesFromNews, findNewsForMarketSymbol } from './services/entity-extraction.js';
import { analyzeCorrelations } from './services/correlation.js';
import { detectGeoConvergence, ingestGeoEvent } from './services/geo-convergence.js';
import { detectHotspotEscalation } from './services/hotspot-escalation.js';
import { detectMilitarySurge, ingestMilitaryActivity } from './services/military-surge.js';
import { analyzeSectorCascade } from './services/sector-cascade.js';

// In-memory cache
let cache = {
  signals: [],
  correlations: [],
  entities: [],
  clusters: [],
  focalPoints: [],
  threats: [],
  hotspots: [],
  macro: null,
  cii: null,
  lastUpdate: null,
};

// State for deduplication
let previousSnapshot = null;

/**
 * Run the full correlation pipeline
 */
export async function runPipeline() {
  console.log('🔄 Running correlation pipeline...');
  const startTime = Date.now();

  try {
    // Step 1: Fetch all data sources
    const [newsItems, markets, predictions] = await Promise.all([
      fetchRSSNews(),
      fetchMarketData(),
      fetchPredictionMarkets(),
    ]);

    console.log(`  📰 Fetched ${newsItems.length} news items`);
    console.log(`  📈 Fetched ${markets.length} market data points`);
    console.log(`  🔮 Fetched ${predictions.length} prediction markets`);

    // Step 2: Cluster similar news
    const clusters = clusterNews(newsItems, getSourceTier);
    console.log(`  🔗 Clustered into ${clusters.length} stories`);

    // Step 3: Extract entities from clusters
    const newsContexts = extractEntitiesFromClusters(clusters);
    const topEntities = getTopEntitiesFromNews(newsContexts, 20);
    console.log(`  🏷️  Extracted ${topEntities.length} top entities`);

    // Step 4: Run correlation analysis
    const { signals: baseSignals, newsContexts: enrichedContexts } = analyzeCorrelations(
      clusters,
      predictions,
      markets,
      previousSnapshot
    );
    console.log(`  🎯 Detected ${baseSignals.length} base correlation signals`);

    // Step 4a: Detect additional signal types
    const additionalSignals = [];

    // Ingest geo events from news clusters (if they have location data)
    for (const cluster of clusters) {
      if (cluster.lat && cluster.lon) {
        ingestGeoEvent(cluster.lat, cluster.lon, 'news', cluster.lastUpdated);
      }
    }

    // Dummy dedup/seen functions for new detectors
    const recentSignalKeys = new Map();
    const isRecentDuplicate = (key) => recentSignalKeys.has(key);
    const markSignalSeen = (key) => recentSignalKeys.set(key, Date.now());

    // Geo convergence
    const geoSignals = detectGeoConvergence(new Set(), isRecentDuplicate, markSignalSeen);
    additionalSignals.push(...geoSignals);
    console.log(`  🌍 Detected ${geoSignals.length} geo convergence signals`);

    // Hotspot escalation
    const hotspotSignals = detectHotspotEscalation(clusters, isRecentDuplicate, markSignalSeen);
    additionalSignals.push(...hotspotSignals);
    console.log(`  🔥 Detected ${hotspotSignals.length} hotspot escalation signals`);

    // Military surge (requires flight data - using empty for now)
    // In full implementation, this would receive actual military flight data
    // ingestMilitaryActivity(flights);
    // const militarySignals = detectMilitarySurge(isRecentDuplicate, markSignalSeen);
    // additionalSignals.push(...militarySignals);

    // Sector cascade
    const sectorSignals = analyzeSectorCascade(markets, isRecentDuplicate, markSignalSeen);
    additionalSignals.push(...sectorSignals);
    console.log(`  🌊 Detected ${sectorSignals.length} sector cascade signals`);

    // Combine all signals
    const signals = [...baseSignals, ...additionalSignals];
    console.log(`  ✅ Total signals: ${signals.length}`);

    // Step 5: Build correlations (market-news entity matches)
    const correlations = [];
    
    for (const market of markets) {
      if (!market.change || Math.abs(market.change) < 2) continue;

      const relatedNews = findNewsForMarketSymbol(market.symbol, enrichedContexts);
      
      if (relatedNews.length > 0) {
        correlations.push({
          symbol: market.symbol,
          name: market.name,
          change: market.change,
          relatedNews: relatedNews.slice(0, 5).map(n => ({
            title: n.title,
            confidence: n.confidence,
          })),
        });
      }
    }

    // Step 6: Detect focal points (convergence zones)
    const focalPoints = detectFocalPoints(clusters, markets);

    // Step 7: Fetch additional intelligence
    const [macro, cii] = await Promise.all([
      fetchMacroSignals(),
      fetchCountryInstability(),
    ]);

    // Update cache
    cache = {
      signals,
      correlations,
      entities: topEntities,
      clusters: clusters.slice(0, 50), // Top 50 clusters
      focalPoints,
      threats: [], // TODO: Implement threat classification
      hotspots: [], // TODO: Implement hotspot detection
      macro,
      cii,
      lastUpdate: new Date().toISOString(),
    };

    const elapsed = Date.now() - startTime;
    console.log(`✅ Pipeline completed in ${elapsed}ms`);

  } catch (error) {
    console.error('❌ Pipeline error:', error.message);
    console.error(error.stack);
  }
}

/**
 * Detect focal points (simple implementation - convergence of multiple signals)
 */
function detectFocalPoints(clusters, markets) {
  const points = [];

  // Geographic focal points: multiple clusters in same region
  const locationClusters = clusters.filter(c => c.lat && c.lon);
  const locationGroups = new Map();

  for (const cluster of locationClusters) {
    const key = `${Math.round(cluster.lat / 5) * 5},${Math.round(cluster.lon / 5) * 5}`;
    const group = locationGroups.get(key) || [];
    group.push(cluster);
    locationGroups.set(key, group);
  }

  for (const [key, group] of locationGroups) {
    if (group.length >= 3) {
      const [lat, lon] = key.split(',').map(Number);
      points.push({
        type: 'geographic',
        lat,
        lon,
        clusterCount: group.length,
        description: `${group.length} stories converging in region`,
      });
    }
  }

  // Topic focal points: multiple data types on same topic
  // (Simplified - just count velocity spikes)
  const recentClusters = clusters.filter(c => 
    Date.now() - c.lastUpdated.getTime() < 60 * 60 * 1000
  );

  if (recentClusters.length >= 5) {
    points.push({
      type: 'velocity',
      clusterCount: recentClusters.length,
      description: `High news velocity: ${recentClusters.length} stories in past hour`,
    });
  }

  return points;
}

/**
 * Get cached intelligence data
 */
export function getCache() {
  return cache;
}

/**
 * Start the engine (run pipeline every 5 minutes)
 */
export function startEngine(intervalMs = 5 * 60 * 1000) {
  console.log('🚀 Starting correlation engine...');
  
  // Run immediately
  runPipeline();
  
  // Then run every N minutes
  const interval = setInterval(runPipeline, intervalMs);
  
  return () => clearInterval(interval);
}
