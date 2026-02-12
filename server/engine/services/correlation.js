/**
 * Correlation Detection - ported from src/services/analysis-core.ts
 * Detect cross-domain correlation signals
 */

import {
  PREDICTION_SHIFT_THRESHOLD,
  MARKET_MOVE_THRESHOLD,
  NEWS_VELOCITY_THRESHOLD,
  FLOW_PRICE_THRESHOLD,
  ENERGY_COMMODITY_SYMBOLS,
  PIPELINE_KEYWORDS,
  FLOW_DROP_KEYWORDS,
  includesKeyword,
  findRelatedTopics,
  generateSignalId,
  generateDedupeKey,
} from '../utils/analysis-constants.js';

import { findNewsForMarketSymbol, extractEntitiesFromClusters } from './entity-extraction.js';

/**
 * Detect market moves with correlated news (Explained Market Move)
 */
export function detectExplainedMarketMoves(markets, newsContexts, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const market of markets) {
    if (!market.change || Math.abs(market.change) < MARKET_MOVE_THRESHOLD) continue;

    const relatedNews = findNewsForMarketSymbol(market.symbol, newsContexts);
    if (relatedNews.length === 0) continue;

    const dedupeKey = generateDedupeKey('explained_market_move', market.symbol, market.change);
    if (isRecentDuplicate(dedupeKey)) continue;

    markSignalSeen(dedupeKey);

    const topNews = relatedNews[0];
    const direction = market.change > 0 ? 'up' : 'down';

    signals.push({
      id: generateSignalId(),
      type: 'explained_market_move',
      title: `${market.display} moves ${direction} with news`,
      description: `${market.display} ${market.change > 0 ? '+' : ''}${market.change.toFixed(1)}% — "${topNews.title.slice(0, 60)}..."`,
      confidence: Math.min(0.95, 0.6 + relatedNews.length * 0.1 + topNews.confidence * 0.2),
      timestamp: new Date(),
      data: {
        marketChange: market.change,
        correlatedNews: relatedNews.map(n => n.title),
        correlatedEntities: [market.symbol],
        explanation: `Market movement correlated with ${relatedNews.length} news ${relatedNews.length === 1 ? 'item' : 'items'}`,
      },
    });
  }

  return signals;
}

/**
 * Detect market moves without correlated news (Silent Divergence)
 */
export function detectSilentDivergence(markets, newsContexts, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const market of markets) {
    if (!market.change || Math.abs(market.change) < MARKET_MOVE_THRESHOLD * 1.5) continue;

    const relatedNews = findNewsForMarketSymbol(market.symbol, newsContexts);
    if (relatedNews.length > 0) continue; // Has news, not silent

    const dedupeKey = generateDedupeKey('silent_divergence', market.symbol, market.change);
    if (isRecentDuplicate(dedupeKey)) continue;

    markSignalSeen(dedupeKey);

    const direction = market.change > 0 ? 'rallying' : 'falling';

    signals.push({
      id: generateSignalId(),
      type: 'silent_divergence',
      title: `${market.display} ${direction} without news`,
      description: `${market.display} ${market.change > 0 ? '+' : ''}${market.change.toFixed(1)}% with no correlated headlines`,
      confidence: Math.min(0.9, 0.5 + Math.abs(market.change) / 20),
      timestamp: new Date(),
      data: {
        marketChange: market.change,
        explanation: 'Significant market movement with no correlated news (insider flow, dark pool, or delayed public disclosure)',
      },
    });
  }

  return signals;
}

/**
 * Detect pipeline flow drops
 */
export function detectPipelineFlowDrops(clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const cluster of clusters) {
    const titles = [
      cluster.primaryTitle,
      ...(cluster.allItems?.map(item => item.title) ?? []),
    ].map(title => title.toLowerCase());

    const hasPipeline = titles.some(title => includesKeyword(title, PIPELINE_KEYWORDS));
    const hasFlowDrop = titles.some(title => includesKeyword(title, FLOW_DROP_KEYWORDS));

    if (hasPipeline && hasFlowDrop) {
      const dedupeKey = generateDedupeKey('flow_drop', cluster.id, cluster.sourceCount);
      if (!isRecentDuplicate(dedupeKey)) {
        markSignalSeen(dedupeKey);
        signals.push({
          id: generateSignalId(),
          type: 'flow_drop',
          title: 'Pipeline Flow Drop',
          description: `"${cluster.primaryTitle.slice(0, 70)}..." indicates reduced flow or disruption`,
          confidence: Math.min(0.9, 0.4 + cluster.sourceCount / 10),
          timestamp: new Date(),
          data: {
            newsVelocity: cluster.sourceCount,
            relatedTopics: ['pipeline', 'flow'],
          },
        });
      }
    }
  }

  return signals;
}

/**
 * Detect flow-price divergence (pipeline issues vs energy prices)
 */
export function detectFlowPriceDivergence(clusters, markets, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  const flowDrops = clusters.filter(cluster => {
    const titles = [
      cluster.primaryTitle,
      ...(cluster.allItems?.map(item => item.title) ?? []),
    ].map(title => title.toLowerCase());

    const hasPipeline = titles.some(title => includesKeyword(title, PIPELINE_KEYWORDS));
    const hasFlowDrop = titles.some(title => includesKeyword(title, FLOW_DROP_KEYWORDS));
    return hasPipeline && hasFlowDrop;
  });

  if (flowDrops.length === 0) return signals;

  for (const market of markets) {
    if (!ENERGY_COMMODITY_SYMBOLS.has(market.symbol)) continue;
    if (!market.change || Math.abs(market.change) < FLOW_PRICE_THRESHOLD) continue;

    const dedupeKey = generateDedupeKey('flow_price_divergence', market.symbol, market.change);
    if (isRecentDuplicate(dedupeKey)) continue;

    markSignalSeen(dedupeKey);

    const direction = market.change > 0 ? 'rising' : 'falling';

    signals.push({
      id: generateSignalId(),
      type: 'flow_price_divergence',
      title: `${market.display} ${direction} amid pipeline issues`,
      description: `${flowDrops.length} pipeline disruption ${flowDrops.length === 1 ? 'report' : 'reports'} while ${market.display} ${market.change > 0 ? '+' : ''}${market.change.toFixed(1)}%`,
      confidence: Math.min(0.85, 0.5 + flowDrops.length * 0.1),
      timestamp: new Date(),
      data: {
        marketChange: market.change,
        newsVelocity: flowDrops.length,
        relatedTopics: ['pipeline', 'energy'],
      },
    });
  }

  return signals;
}

/**
 * Detect prediction market shifts leading news
 */
export function detectPredictionLeadsNews(predictions, clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const prediction of predictions) {
    if (Math.abs(prediction.yesPrice - 50) < PREDICTION_SHIFT_THRESHOLD) continue;

    const relatedTopics = findRelatedTopics(prediction.title);
    if (relatedTopics.length === 0) continue;

    const relatedClusters = clusters.filter(cluster => {
      const titleLower = cluster.primaryTitle.toLowerCase();
      return relatedTopics.some(topic => titleLower.includes(topic));
    });

    if (relatedClusters.length === 0) continue;

    const dedupeKey = generateDedupeKey('prediction_leads_news', prediction.title, prediction.yesPrice);
    if (isRecentDuplicate(dedupeKey)) continue;

    markSignalSeen(dedupeKey);

    signals.push({
      id: generateSignalId(),
      type: 'prediction_leads_news',
      title: 'Prediction market shift with news',
      description: `"${prediction.title.slice(0, 50)}..." at ${prediction.yesPrice.toFixed(0)}% — ${relatedClusters.length} related ${relatedClusters.length === 1 ? 'headline' : 'headlines'}`,
      confidence: Math.min(0.9, 0.5 + Math.abs(prediction.yesPrice - 50) / 100 + relatedClusters.length * 0.1),
      timestamp: new Date(),
      data: {
        predictionShift: prediction.yesPrice,
        newsVelocity: relatedClusters.length,
        relatedTopics,
      },
    });
  }

  return signals;
}

/**
 * Detect velocity spikes (unusual news velocity on a topic)
 */
export function detectVelocitySpikes(clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  // Count clusters per hour for recent news
  const recentClusters = clusters.filter(c => 
    Date.now() - c.lastUpdated.getTime() < 60 * 60 * 1000
  );

  if (recentClusters.length < NEWS_VELOCITY_THRESHOLD * 2) return signals;

  // Extract common keywords
  const keywords = new Map();
  for (const cluster of recentClusters) {
    const titleLower = cluster.primaryTitle.toLowerCase();
    const words = titleLower.split(/\s+/).filter(w => w.length > 4);
    for (const word of words) {
      keywords.set(word, (keywords.get(word) || 0) + 1);
    }
  }

  // Find keywords with high frequency
  const topKeywords = Array.from(keywords.entries())
    .filter(([_, count]) => count >= NEWS_VELOCITY_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  for (const [keyword, count] of topKeywords) {
    const dedupeKey = generateDedupeKey('velocity_spike', keyword, count);
    if (isRecentDuplicate(dedupeKey)) continue;

    markSignalSeen(dedupeKey);

    signals.push({
      id: generateSignalId(),
      type: 'velocity_spike',
      title: `High news velocity: "${keyword}"`,
      description: `${count} headlines in the past hour mention "${keyword}"`,
      confidence: Math.min(0.85, 0.4 + count / 20),
      timestamp: new Date(),
      data: {
        newsVelocity: count,
        relatedTopics: [keyword],
      },
    });
  }

  return signals;
}

/**
 * Get source type for classification (wire, gov, intel, mainstream, market, tech, other)
 */
function getSourceType(source) {
  const s = source.toLowerCase();
  
  // Wire services
  if (s.includes('reuters') || s.includes('ap news') || s.includes('bloomberg')) return 'wire';
  
  // Government/Official
  if (s.includes('state dept') || s.includes('pentagon') || s.includes('white house') || 
      s.includes('gov.uk') || s.includes('.gov')) return 'gov';
  
  // Intelligence/Defense
  if (s.includes('janes') || s.includes('defense') || s.includes('military') || 
      s.includes('stratfor')) return 'intel';
  
  // Mainstream media
  if (s.includes('cnn') || s.includes('bbc') || s.includes('nyt') || s.includes('wsj') || 
      s.includes('ft') || s.includes('guardian')) return 'mainstream';
  
  // Market/Financial
  if (s.includes('market') || s.includes('nasdaq') || s.includes('tradingview') || 
      s.includes('benzinga')) return 'market';
  
  // Tech
  if (s.includes('techcrunch') || s.includes('verge') || s.includes('wired') || 
      s.includes('ars technica')) return 'tech';
  
  return 'other';
}

/**
 * Detect source convergence (3+ different source types covering same story)
 */
export function detectConvergence(clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];
  const WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const now = Date.now();

  for (const cluster of clusters) {
    if (!cluster.allItems || cluster.allItems.length < 3) continue;

    const recentItems = cluster.allItems.filter(
      item => now - item.pubDate.getTime() < WINDOW_MS
    );
    if (recentItems.length < 3) continue;

    const sourceTypes = new Set();
    for (const item of recentItems) {
      const type = getSourceType(item.source);
      sourceTypes.add(type);
    }

    if (sourceTypes.size >= 3) {
      const types = Array.from(sourceTypes).filter(t => t !== 'other');
      const dedupeKey = generateDedupeKey('convergence', cluster.id, sourceTypes.size);

      if (!isRecentDuplicate(dedupeKey) && types.length >= 3) {
        markSignalSeen(dedupeKey);
        signals.push({
          id: generateSignalId(),
          type: 'convergence',
          title: 'Source Convergence',
          description: `"${cluster.primaryTitle.slice(0, 50)}..." reported by ${types.join(', ')} (${recentItems.length} sources in 1h)`,
          confidence: Math.min(0.95, 0.6 + sourceTypes.size * 0.1),
          timestamp: new Date(),
          data: {
            newsVelocity: recentItems.length,
            relatedTopics: types,
          },
        });
      }
    }
  }

  return signals;
}

/**
 * Detect triangulation (wire + gov + intel all aligned on same story)
 */
export function detectTriangulation(clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];
  const CRITICAL_TYPES = ['wire', 'gov', 'intel'];

  for (const cluster of clusters) {
    if (!cluster.allItems || cluster.allItems.length < 3) continue;

    const typePresent = new Set();
    for (const item of cluster.allItems) {
      const t = getSourceType(item.source);
      if (CRITICAL_TYPES.includes(t)) {
        typePresent.add(t);
      }
    }

    if (typePresent.size === 3) {
      const dedupeKey = generateDedupeKey('triangulation', cluster.id, 3);

      if (!isRecentDuplicate(dedupeKey)) {
        markSignalSeen(dedupeKey);
        signals.push({
          id: generateSignalId(),
          type: 'triangulation',
          title: 'Intel Triangulation',
          description: `Wire + Gov + Intel aligned: "${cluster.primaryTitle.slice(0, 45)}..."`,
          confidence: 0.9,
          timestamp: new Date(),
          data: {
            newsVelocity: cluster.sourceCount,
            relatedTopics: Array.from(typePresent),
          },
        });
      }
    }
  }

  return signals;
}

/**
 * Detect news leading markets (high news velocity with market movement)
 */
export function detectNewsLeadsMarkets(clusters, markets, newsContexts, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  // Find high-velocity clusters
  const highVelocityClusters = clusters.filter(c => 
    c.sourceCount >= NEWS_VELOCITY_THRESHOLD &&
    (Date.now() - c.lastUpdated.getTime()) < 60 * 60 * 1000
  );

  if (highVelocityClusters.length === 0) return signals;

  for (const market of markets) {
    if (!market.change || Math.abs(market.change) < MARKET_MOVE_THRESHOLD) continue;

    const relatedNews = findNewsForMarketSymbol(market.symbol, newsContexts);
    const highVelocityRelated = relatedNews.filter(news => 
      highVelocityClusters.some(c => c.id === news.clusterId)
    );

    if (highVelocityRelated.length > 0) {
      const dedupeKey = generateDedupeKey('news_leads_markets', market.symbol, market.change);
      if (isRecentDuplicate(dedupeKey)) continue;

      markSignalSeen(dedupeKey);

      const topNews = highVelocityRelated[0];
      const direction = market.change > 0 ? 'up' : 'down';

      signals.push({
        id: generateSignalId(),
        type: 'news_leads_markets',
        title: `News driving ${market.display} ${direction}`,
        description: `High-velocity news: "${topNews.title.slice(0, 50)}..." → ${market.display} ${market.change > 0 ? '+' : ''}${market.change.toFixed(1)}%`,
        confidence: Math.min(0.95, 0.7 + highVelocityRelated.length * 0.1),
        timestamp: new Date(),
        data: {
          marketChange: market.change,
          newsVelocity: highVelocityRelated.reduce((sum, n) => sum + (n.sourceCount || 1), 0),
          correlatedEntities: [market.symbol],
          correlatedNews: highVelocityRelated.map(n => n.title),
          explanation: `${highVelocityRelated.length} high-velocity news cluster${highVelocityRelated.length > 1 ? 's' : ''} correlate with market move`,
        },
      });
    }
  }

  return signals;
}

/**
 * Main correlation analysis orchestrator
 */
export function analyzeCorrelations(clusters, predictions, markets, previousSnapshot) {
  const signals = [];
  
  // State management
  const recentSignalKeys = new Map();
  const DEFAULT_DEDUPE_TTL = 30 * 60 * 1000;
  const DEDUPE_TTLS = {
    silent_divergence: 6 * 60 * 60 * 1000,
    flow_price_divergence: 6 * 60 * 60 * 1000,
    explained_market_move: 6 * 60 * 60 * 1000,
    prediction_leads_news: 2 * 60 * 60 * 1000,
  };

  function getDedupeType(key) {
    return key.split(':')[0] || 'default';
  }

  function isRecentDuplicate(key) {
    const seen = recentSignalKeys.get(key);
    if (!seen) return false;
    const type = getDedupeType(key);
    const ttl = DEDUPE_TTLS[type] ?? DEFAULT_DEDUPE_TTL;
    return Date.now() - seen < ttl;
  }

  function markSignalSeen(key) {
    recentSignalKeys.set(key, Date.now());
    if (recentSignalKeys.size > 500) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const [k, t] of recentSignalKeys) {
        if (t < cutoff) recentSignalKeys.delete(k);
      }
    }
  }

  // Extract entities from clusters (imported at top of file)
  const newsContexts = extractEntitiesFromClusters(clusters);

  // Run all detectors
  signals.push(...detectExplainedMarketMoves(markets, newsContexts, isRecentDuplicate, markSignalSeen));
  signals.push(...detectSilentDivergence(markets, newsContexts, isRecentDuplicate, markSignalSeen));
  signals.push(...detectPipelineFlowDrops(clusters, isRecentDuplicate, markSignalSeen));
  signals.push(...detectFlowPriceDivergence(clusters, markets, isRecentDuplicate, markSignalSeen));
  signals.push(...detectPredictionLeadsNews(predictions, clusters, isRecentDuplicate, markSignalSeen));
  signals.push(...detectVelocitySpikes(clusters, isRecentDuplicate, markSignalSeen));
  signals.push(...detectConvergence(clusters, isRecentDuplicate, markSignalSeen));
  signals.push(...detectTriangulation(clusters, isRecentDuplicate, markSignalSeen));
  signals.push(...detectNewsLeadsMarkets(clusters, markets, newsContexts, isRecentDuplicate, markSignalSeen));

  return {
    signals: signals.sort((a, b) => b.confidence - a.confidence),
    newsContexts,
  };
}
