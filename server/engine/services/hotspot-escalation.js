/**
 * Hotspot Escalation Tracking - ported from src/services/hotspot-escalation.ts
 * Tracks escalation scores for geographic hotspots over time
 */

import { generateSignalId, generateDedupeKey } from '../utils/analysis-constants.js';

// Hotspot definitions (simplified version)
const INTEL_HOTSPOTS = [
  { id: 'tehran', name: 'Tehran', lat: 35.7, lon: 51.4, escalationScore: 4 },
  { id: 'moscow', name: 'Moscow', lat: 55.75, lon: 37.6, escalationScore: 3 },
  { id: 'beijing', name: 'Beijing', lat: 39.9, lon: 116.4, escalationScore: 3 },
  { id: 'kyiv', name: 'Kyiv', lat: 50.45, lon: 30.52, escalationScore: 5 },
  { id: 'taipei', name: 'Taipei', lat: 25.03, lon: 121.56, escalationScore: 4 },
  { id: 'telaviv', name: 'Tel Aviv', lat: 32.08, lon: 34.78, escalationScore: 5 },
  { id: 'pyongyang', name: 'Pyongyang', lat: 39.03, lon: 125.75, escalationScore: 3 },
  { id: 'sanaa', name: 'Sanaa', lat: 15.35, lon: 44.21, escalationScore: 4 },
];

const COMPONENT_WEIGHTS = {
  news: 0.35,
  cii: 0.25,
  geo: 0.25,
  military: 0.15,
};

const scores = new Map();
const lastSignalTime = new Map();
const SIGNAL_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_HISTORY_POINTS = 48;

/**
 * Get static baseline score for a hotspot
 */
function getStaticBaseline(hotspot) {
  return hotspot.escalationScore ?? 3;
}

/**
 * Normalize news activity to 0-100 scale
 */
function normalizeNewsActivity(matches, hasBreaking, velocity) {
  return Math.min(100, matches * 15 + (hasBreaking ? 30 : 0) + velocity * 5);
}

/**
 * Normalize Country Instability Index (CII) to 0-100 scale
 */
function normalizeCII(score) {
  return score ?? 30;
}

/**
 * Normalize geographic convergence score to 0-100 scale
 */
function normalizeGeo(alertScore, alertTypes) {
  if (alertScore === 0) return 0;
  return Math.min(100, alertScore + alertTypes * 10);
}

/**
 * Normalize military activity to 0-100 scale
 */
function normalizeMilitary(flights, vessels) {
  return Math.min(100, flights * 10 + vessels * 15);
}

/**
 * Calculate dynamic raw score from components
 */
function calculateDynamicRaw(components) {
  return (
    components.newsActivity * COMPONENT_WEIGHTS.news +
    components.ciiContribution * COMPONENT_WEIGHTS.cii +
    components.geoConvergence * COMPONENT_WEIGHTS.geo +
    components.militaryActivity * COMPONENT_WEIGHTS.military
  );
}

/**
 * Convert raw score (0-100) to escalation score (1-5)
 */
function rawToScore(raw) {
  return 1 + (raw / 100) * 4;
}

/**
 * Blend static baseline with dynamic score
 */
function blendScores(staticBaseline, dynamicScore) {
  return staticBaseline * 0.3 + dynamicScore * 0.7;
}

/**
 * Prune history older than window
 */
function pruneHistory(history) {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const pruned = history.filter(h => h.timestamp >= cutoff);
  if (pruned.length > MAX_HISTORY_POINTS) {
    return pruned.slice(-MAX_HISTORY_POINTS);
  }
  return pruned;
}

/**
 * Detect escalation trend from history
 */
function detectTrend(history) {
  if (history.length < 3) return 'stable';

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  let validCount = 0;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (!entry) continue;
    sumX += validCount;
    sumY += entry.score;
    sumXY += validCount * entry.score;
    sumX2 += validCount * validCount;
    validCount++;
  }

  if (validCount < 3) return 'stable';

  const denominator = validCount * sumX2 - sumX * sumX;
  if (denominator === 0) return 'stable';

  const slope = (validCount * sumXY - sumX * sumY) / denominator;

  if (slope > 0.1) return 'escalating';
  if (slope < -0.1) return 'de-escalating';
  return 'stable';
}

/**
 * Calculate dynamic escalation score for a hotspot
 */
export function calculateDynamicScore(hotspotId, inputs) {
  const hotspot = INTEL_HOTSPOTS.find(h => h.id === hotspotId);
  if (!hotspot) {
    return null;
  }

  const staticBaseline = getStaticBaseline(hotspot);
  const existing = scores.get(hotspotId);
  const now = Date.now();

  const components = {
    newsActivity: normalizeNewsActivity(inputs.newsMatches, inputs.hasBreaking, inputs.newsVelocity),
    ciiContribution: normalizeCII(inputs.ciiScore),
    geoConvergence: normalizeGeo(inputs.geoAlertScore, inputs.geoAlertTypes),
    militaryActivity: normalizeMilitary(inputs.flightsNearby, inputs.vesselsNearby),
  };

  const dynamicRaw = calculateDynamicRaw(components);
  const dynamicScore = rawToScore(dynamicRaw);
  const combinedScore = blendScores(staticBaseline, dynamicScore);

  let history = existing?.history ?? [];
  history = pruneHistory(history);
  history.push({ timestamp: now, score: combinedScore });

  const trend = detectTrend(history);

  const result = {
    hotspotId,
    staticBaseline,
    dynamicScore: Math.round(dynamicScore * 10) / 10,
    combinedScore: Math.round(combinedScore * 10) / 10,
    trend,
    components,
    history,
    lastUpdated: new Date(),
  };

  scores.set(hotspotId, result);
  return result;
}

/**
 * Detect hotspot escalation signals
 */
export function detectHotspotEscalation(clusters, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const hotspot of INTEL_HOTSPOTS) {
    // Count news matches for this hotspot
    const newsMatches = clusters.filter(c => {
      const titleLower = c.primaryTitle.toLowerCase();
      return titleLower.includes(hotspot.name.toLowerCase());
    }).length;

    const hasBreaking = clusters.some(c => c.isAlert);
    const newsVelocity = newsMatches;

    // Calculate score
    const inputs = {
      newsMatches,
      hasBreaking,
      newsVelocity,
      ciiScore: null, // Would be populated from country instability service
      geoAlertScore: 0, // Would be populated from geo convergence
      geoAlertTypes: 0,
      flightsNearby: 0, // Would be populated from military data
      vesselsNearby: 0,
    };

    const previous = scores.get(hotspot.id);
    const current = calculateDynamicScore(hotspot.id, inputs);

    if (!current || !previous) continue;

    // Check if we should emit a signal
    const lastSignal = lastSignalTime.get(hotspot.id) ?? 0;
    if (Date.now() - lastSignal < SIGNAL_COOLDOWN_MS) continue;

    const oldScore = previous.combinedScore;
    const newScore = current.combinedScore;

    // Threshold crossed
    const oldInt = Math.floor(oldScore);
    const newInt = Math.floor(newScore);
    
    if (newInt > oldInt && newScore >= 2) {
      const dedupeKey = generateDedupeKey('hotspot_escalation', hotspot.id, newScore);
      if (isRecentDuplicate && isRecentDuplicate(dedupeKey)) continue;

      if (markSignalSeen) markSignalSeen(dedupeKey);
      lastSignalTime.set(hotspot.id, Date.now());

      signals.push({
        id: generateSignalId(),
        type: 'hotspot_escalation',
        title: `${hotspot.name} escalation level ${newInt}`,
        description: `Escalation score increased from ${oldScore.toFixed(1)} to ${newScore.toFixed(1)} (${current.trend})`,
        confidence: Math.min(0.95, 0.6 + (newScore - oldScore) * 0.2),
        timestamp: new Date(),
        data: {
          hotspot: hotspot.name,
          lat: hotspot.lat,
          lon: hotspot.lon,
          oldScore,
          newScore,
          trend: current.trend,
          components: current.components,
          explanation: `${hotspot.name} crossed threshold ${oldInt} → ${newInt}`,
        },
      });
    }
  }

  return signals;
}

/**
 * Get current escalation score for a hotspot
 */
export function getHotspotEscalation(hotspotId) {
  return scores.get(hotspotId) ?? null;
}

/**
 * Get all escalation scores
 */
export function getAllEscalationScores() {
  return Array.from(scores.values());
}

/**
 * Clear escalation data (for testing)
 */
export function clearEscalationData() {
  scores.clear();
  lastSignalTime.clear();
}
