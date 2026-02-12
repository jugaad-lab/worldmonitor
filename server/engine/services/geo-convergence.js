/**
 * Geographic Convergence Detection - ported from src/services/geo-convergence.ts
 * Detects when multiple event types converge in same geographic cell
 */

import { generateSignalId, generateDedupeKey } from '../utils/analysis-constants.js';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const CONVERGENCE_THRESHOLD = 3; // Minimum event types for convergence

// Store geographic cells (1 degree grid cells)
const cells = new Map();

/**
 * Generate cell ID from lat/lon (1 degree grid)
 */
export function getCellId(lat, lon) {
  return `${Math.floor(lat)},${Math.floor(lon)}`;
}

/**
 * Ingest a geographic event into the grid
 */
export function ingestGeoEvent(lat, lon, type, timestamp = new Date()) {
  const cellId = getCellId(lat, lon);

  let cell = cells.get(cellId);
  if (!cell) {
    cell = {
      id: cellId,
      lat: Math.floor(lat) + 0.5,
      lon: Math.floor(lon) + 0.5,
      events: new Map(),
      firstSeen: timestamp,
    };
    cells.set(cellId, cell);
  }

  const existing = cell.events.get(type);
  cell.events.set(type, {
    count: (existing?.count ?? 0) + 1,
    lastSeen: timestamp,
  });
}

/**
 * Prune old events from cells
 */
function pruneOldEvents() {
  const cutoff = Date.now() - WINDOW_MS;

  for (const [cellId, cell] of cells) {
    for (const [type, data] of cell.events) {
      if (data.lastSeen.getTime() < cutoff) {
        cell.events.delete(type);
      }
    }
    if (cell.events.size === 0) {
      cells.delete(cellId);
    }
  }
}

/**
 * Detect geographic convergence signals
 */
export function detectGeoConvergence(seenAlerts, isRecentDuplicate, markSignalSeen) {
  pruneOldEvents();

  const signals = [];

  for (const [cellId, cell] of cells) {
    if (cell.events.size >= CONVERGENCE_THRESHOLD) {
      const dedupeKey = generateDedupeKey('geo_convergence', cellId, cell.events.size);
      
      if (isRecentDuplicate && isRecentDuplicate(dedupeKey)) continue;

      const types = Array.from(cell.events.keys());
      const totalEvents = Array.from(cell.events.values())
        .reduce((sum, d) => sum + d.count, 0);

      const typeScore = cell.events.size * 25;
      const countBoost = Math.min(25, totalEvents * 2);
      const score = Math.min(100, typeScore + countBoost);

      // Get location name (simplified - in full version this would use reverse geocoding)
      const locationName = getLocationName(cell.lat, cell.lon);

      if (markSignalSeen) markSignalSeen(dedupeKey);
      if (seenAlerts) seenAlerts.add(cellId);

      signals.push({
        id: generateSignalId(),
        type: 'geo_convergence',
        title: `Geographic convergence: ${locationName}`,
        description: `${types.join(', ')} (${totalEvents} total events) in ${locationName}`,
        confidence: Math.min(0.95, 0.5 + (cell.events.size - 2) * 0.15),
        timestamp: new Date(),
        data: {
          lat: cell.lat,
          lon: cell.lon,
          eventTypes: types,
          totalEvents,
          location: locationName,
          explanation: `${cell.events.size} different event types converged in same geographic area`,
        },
      });
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Simplified location name from coordinates
 */
function getLocationName(lat, lon) {
  // Simplified mapping - full version would use more sophisticated geocoding
  if (lat >= 25 && lat <= 40 && lon >= 44 && lon <= 63) return 'Iran region';
  if (lat >= 29 && lat <= 33 && lon >= 34 && lon <= 36) return 'Israel/Gaza';
  if (lat >= 44 && lat <= 52 && lon >= 22 && lon <= 40) return 'Eastern Europe';
  if (lat >= 50 && lat <= 82 && lon >= 20 && lon <= 180) return 'Russia';
  if (lat >= 20 && lat <= 55 && lon >= 73 && lon <= 135) return 'China region';
  if (lat >= 22 && lat <= 25 && lon >= 120 && lon <= 122) return 'Taiwan Strait';
  if (lat >= 22 && lat <= 32 && lon >= 25 && lon <= 35) return 'Egypt region';
  
  return `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
}

/**
 * Clear all geo convergence data (for testing)
 */
export function clearGeoConvergenceData() {
  cells.clear();
}

/**
 * Get convergence stats for monitoring
 */
export function getGeoConvergenceStats() {
  return {
    totalCells: cells.size,
    convergentCells: Array.from(cells.values()).filter(c => c.events.size >= CONVERGENCE_THRESHOLD).length,
    topCells: Array.from(cells.values())
      .filter(c => c.events.size >= CONVERGENCE_THRESHOLD)
      .sort((a, b) => b.events.size - a.events.size)
      .slice(0, 5)
      .map(c => ({
        lat: c.lat,
        lon: c.lon,
        eventTypes: Array.from(c.events.keys()),
        totalEvents: Array.from(c.events.values()).reduce((sum, d) => sum + d.count, 0),
      })),
  };
}
