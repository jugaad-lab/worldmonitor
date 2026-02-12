/**
 * Military Surge Detection - ported from src/services/military-surge.ts
 * Detects unusual military activity in specific theaters
 */

import { generateSignalId, generateDedupeKey } from '../utils/analysis-constants.js';

// Military theater definitions (simplified)
const THEATERS = [
  {
    id: 'middle-east',
    name: 'Middle East / Persian Gulf',
    centerLat: 27.0,
    centerLon: 50.0,
    radiusKm: 1000,
  },
  {
    id: 'europe-east',
    name: 'Eastern Europe',
    centerLat: 45.0,
    centerLon: 25.0,
    radiusKm: 800,
  },
  {
    id: 'pacific-west',
    name: 'Western Pacific',
    centerLat: 30.0,
    centerLon: 130.0,
    radiusKm: 1200,
  },
  {
    id: 'taiwan-strait',
    name: 'Taiwan Strait',
    centerLat: 24.5,
    centerLon: 119.5,
    radiusKm: 400,
  },
  {
    id: 'black-sea',
    name: 'Black Sea',
    centerLat: 43.5,
    centerLon: 34.0,
    radiusKm: 500,
  },
];

const SURGE_THRESHOLD = 1.5; // 50% above baseline
const BASELINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for baseline
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours for current activity

// Store activity history
const activityHistory = new Map();
const lastSurgeAlert = new Map();
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Haversine distance in kilometers
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + 
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a coordinate is within a theater
 */
function isInTheater(lat, lon, theater) {
  return haversineKm(lat, lon, theater.centerLat, theater.centerLon) <= theater.radiusKm;
}

/**
 * Classify aircraft type
 */
function classifyAircraftType(aircraft) {
  if (!aircraft.type) return 'unknown';
  
  const type = aircraft.type.toLowerCase();
  
  // Transport/Airlift
  if (type.includes('c-17') || type.includes('c-130') || type.includes('c-5') ||
      type.includes('transport') || type.includes('cargo')) {
    return 'airlift';
  }
  
  // Fighter/Combat
  if (type.includes('f-16') || type.includes('f-35') || type.includes('f-22') ||
      type.includes('fighter') || type.includes('strike')) {
    return 'fighter';
  }
  
  // Reconnaissance
  if (type.includes('rc-135') || type.includes('p-8') || type.includes('e-3') ||
      type.includes('recon') || type.includes('awacs') || type.includes('surveillance')) {
    return 'reconnaissance';
  }
  
  // Tanker
  if (type.includes('kc-') || type.includes('tanker') || type.includes('refuel')) {
    return 'tanker';
  }
  
  return 'other';
}

/**
 * Ingest military flight activity
 */
export function ingestMilitaryActivity(flights, timestamp = Date.now()) {
  for (const theater of THEATERS) {
    const flightsInTheater = flights.filter(f => 
      isInTheater(f.lat, f.lon, theater)
    );

    if (flightsInTheater.length === 0) continue;

    // Count by type
    const typeCount = { airlift: 0, fighter: 0, reconnaissance: 0, tanker: 0, other: 0 };
    for (const flight of flightsInTheater) {
      const type = classifyAircraftType(flight);
      typeCount[type]++;
    }

    const activity = {
      theaterId: theater.id,
      timestamp,
      transportCount: typeCount.airlift,
      fighterCount: typeCount.fighter,
      reconCount: typeCount.reconnaissance,
      tankerCount: typeCount.tanker,
      totalMilitary: flightsInTheater.length,
      flightIds: flightsInTheater.map(f => f.id || f.callsign),
    };

    // Store in history
    let history = activityHistory.get(theater.id) || [];
    history.push(activity);
    
    // Prune old history
    const cutoff = timestamp - BASELINE_WINDOW_MS;
    history = history.filter(h => h.timestamp >= cutoff);
    
    activityHistory.set(theater.id, history);
  }
}

/**
 * Calculate baseline activity for a theater
 */
function calculateBaseline(theaterId) {
  const history = activityHistory.get(theaterId) || [];
  if (history.length === 0) return { airlift: 0, fighter: 0, reconnaissance: 0, total: 0 };

  const cutoff = Date.now() - BASELINE_WINDOW_MS;
  const baselineData = history.filter(h => h.timestamp >= cutoff);

  if (baselineData.length === 0) return { airlift: 0, fighter: 0, reconnaissance: 0, total: 0 };

  const sum = baselineData.reduce((acc, d) => ({
    airlift: acc.airlift + d.transportCount,
    fighter: acc.fighter + d.fighterCount,
    reconnaissance: acc.reconnaissance + d.reconCount,
    total: acc.total + d.totalMilitary,
  }), { airlift: 0, fighter: 0, reconnaissance: 0, total: 0 });

  const count = baselineData.length;
  return {
    airlift: sum.airlift / count,
    fighter: sum.fighter / count,
    reconnaissance: sum.reconnaissance / count,
    total: sum.total / count,
  };
}

/**
 * Calculate current activity for a theater
 */
function calculateCurrentActivity(theaterId) {
  const history = activityHistory.get(theaterId) || [];
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const recentData = history.filter(h => h.timestamp >= cutoff);

  if (recentData.length === 0) return null;

  // Use most recent snapshot
  const latest = recentData[recentData.length - 1];
  return {
    airlift: latest.transportCount,
    fighter: latest.fighterCount,
    reconnaissance: latest.reconCount,
    total: latest.totalMilitary,
  };
}

/**
 * Detect military surge signals
 */
export function detectMilitarySurge(isRecentDuplicate, markSignalSeen) {
  const signals = [];

  for (const theater of THEATERS) {
    const baseline = calculateBaseline(theater.id);
    const current = calculateCurrentActivity(theater.id);

    if (!current) continue;

    // Check each activity type for surge
    const surges = [];
    
    if (current.airlift > baseline.airlift * SURGE_THRESHOLD && current.airlift >= 3) {
      surges.push({ type: 'airlift', current: current.airlift, baseline: baseline.airlift });
    }
    
    if (current.fighter > baseline.fighter * SURGE_THRESHOLD && current.fighter >= 2) {
      surges.push({ type: 'fighter', current: current.fighter, baseline: baseline.fighter });
    }
    
    if (current.reconnaissance > baseline.reconnaissance * SURGE_THRESHOLD && current.reconnaissance >= 2) {
      surges.push({ type: 'reconnaissance', current: current.reconnaissance, baseline: baseline.reconnaissance });
    }

    for (const surge of surges) {
      // Check cooldown
      const alertKey = `${theater.id}:${surge.type}`;
      const lastAlert = lastSurgeAlert.get(alertKey) ?? 0;
      if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) continue;

      const dedupeKey = generateDedupeKey('military_surge', alertKey, surge.current);
      if (isRecentDuplicate && isRecentDuplicate(dedupeKey)) continue;

      const surgeMultiple = surge.current / Math.max(1, surge.baseline);
      
      if (markSignalSeen) markSignalSeen(dedupeKey);
      lastSurgeAlert.set(alertKey, Date.now());

      signals.push({
        id: generateSignalId(),
        type: 'military_surge',
        title: `Military ${surge.type} surge in ${theater.name}`,
        description: `${surge.current} ${surge.type} aircraft (${surgeMultiple.toFixed(1)}x baseline of ${surge.baseline.toFixed(1)})`,
        confidence: Math.min(0.95, 0.6 + Math.min(0.3, (surgeMultiple - 1) * 0.3)),
        timestamp: new Date(),
        data: {
          theater: theater.name,
          activityType: surge.type,
          currentCount: surge.current,
          baselineCount: surge.baseline,
          surgeMultiple: Math.round(surgeMultiple * 10) / 10,
          explanation: `${surge.type} activity in ${theater.name} is ${Math.round((surgeMultiple - 1) * 100)}% above baseline`,
        },
      });
    }
  }

  return signals;
}

/**
 * Get theater activity stats (for monitoring)
 */
export function getTheaterActivityStats() {
  return THEATERS.map(theater => {
    const baseline = calculateBaseline(theater.id);
    const current = calculateCurrentActivity(theater.id);
    
    return {
      theater: theater.name,
      baseline,
      current,
      history: activityHistory.get(theater.id)?.length || 0,
    };
  });
}

/**
 * Clear military surge data (for testing)
 */
export function clearMilitarySurgeData() {
  activityHistory.clear();
  lastSurgeAlert.clear();
}
