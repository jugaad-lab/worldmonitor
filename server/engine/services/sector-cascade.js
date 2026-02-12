/**
 * Sector Cascade Detection - detects when market movements ripple across related sectors
 * When multiple sectors move together, it indicates systemic reaction to a catalyzing event
 */

import { generateSignalId, generateDedupeKey } from '../utils/analysis-constants.js';

// Sector ETF symbols and their relationships
const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology', related: ['AAPL', 'MSFT', 'NVDA', 'GOOGL'] },
  { symbol: 'XLF', name: 'Financials', related: ['JPM', 'BAC', 'V', 'MA'] },
  { symbol: 'XLE', name: 'Energy', related: ['XOM', 'CVX', 'CL=F'] },
  { symbol: 'XLV', name: 'Healthcare', related: ['LLY', 'UNH', 'JNJ'] },
  { symbol: 'XLI', name: 'Industrials', related: ['LMT', 'RTX', 'BA'] },
  { symbol: 'XLP', name: 'Consumer Staples', related: ['WMT', 'COST', 'PG'] },
  { symbol: 'XLY', name: 'Consumer Discretionary', related: ['TSLA', 'AMZN', 'HD'] },
  { symbol: 'SMH', name: 'Semiconductors', related: ['NVDA', 'TSM', 'AVGO', 'AMD'] },
];

const CASCADE_THRESHOLD = 3; // Minimum sectors moving together
const MOVE_THRESHOLD = 1.0; // Minimum % move to consider

/**
 * Detect sector cascade signals
 */
export function detectSectorCascade(markets, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  // Find sector ETFs in the markets data
  const sectorMoves = [];
  
  for (const sector of SECTOR_ETFS) {
    const market = markets.find(m => m.symbol === sector.symbol);
    if (!market || !market.change) continue;
    
    if (Math.abs(market.change) >= MOVE_THRESHOLD) {
      sectorMoves.push({
        ...sector,
        change: market.change,
        direction: market.change > 0 ? 'up' : 'down',
      });
    }
  }

  if (sectorMoves.length < CASCADE_THRESHOLD) return signals;

  // Group by direction
  const upMoves = sectorMoves.filter(s => s.direction === 'up');
  const downMoves = sectorMoves.filter(s => s.direction === 'down');

  // Check for cascade in either direction
  const cascades = [];
  
  if (upMoves.length >= CASCADE_THRESHOLD) {
    cascades.push({
      direction: 'up',
      sectors: upMoves,
      avgChange: upMoves.reduce((sum, s) => sum + s.change, 0) / upMoves.length,
    });
  }
  
  if (downMoves.length >= CASCADE_THRESHOLD) {
    cascades.push({
      direction: 'down',
      sectors: downMoves,
      avgChange: downMoves.reduce((sum, s) => sum + Math.abs(s.change), 0) / downMoves.length,
    });
  }

  for (const cascade of cascades) {
    const sectorNames = cascade.sectors.map(s => s.name).join(', ');
    const dedupeKey = generateDedupeKey('sector_cascade', cascade.direction, cascade.sectors.length);
    
    if (isRecentDuplicate && isRecentDuplicate(dedupeKey)) continue;
    
    if (markSignalSeen) markSignalSeen(dedupeKey);

    const directionLabel = cascade.direction === 'up' ? 'rallying' : 'declining';
    
    signals.push({
      id: generateSignalId(),
      type: 'sector_cascade',
      title: `Sector cascade: ${cascade.sectors.length} sectors ${directionLabel}`,
      description: `${sectorNames} all moving ${cascade.direction} (avg ${cascade.direction === 'up' ? '+' : '-'}${cascade.avgChange.toFixed(1)}%)`,
      confidence: Math.min(0.95, 0.6 + cascade.sectors.length * 0.1),
      timestamp: new Date(),
      data: {
        direction: cascade.direction,
        sectorCount: cascade.sectors.length,
        sectors: cascade.sectors.map(s => ({ name: s.name, change: s.change })),
        avgChange: Math.round(cascade.avgChange * 10) / 10,
        explanation: `${cascade.sectors.length} sectors moving together indicates systemic market reaction`,
      },
    });
  }

  return signals;
}

/**
 * Detect sector divergence (when one sector moves opposite to the group)
 */
export function detectSectorDivergence(markets, isRecentDuplicate, markSignalSeen) {
  const signals = [];

  // Find sector ETFs with significant moves
  const sectorMoves = SECTOR_ETFS
    .map(sector => {
      const market = markets.find(m => m.symbol === sector.symbol);
      if (!market || !market.change || Math.abs(market.change) < MOVE_THRESHOLD) return null;
      return {
        ...sector,
        change: market.change,
        direction: market.change > 0 ? 'up' : 'down',
      };
    })
    .filter(Boolean);

  if (sectorMoves.length < 4) return signals;

  // Check if one sector is moving opposite to the majority
  const upCount = sectorMoves.filter(s => s.direction === 'up').length;
  const downCount = sectorMoves.filter(s => s.direction === 'down').length;

  // If majority is going one way and minority (1-2) going the other
  if ((upCount >= 3 && downCount <= 2) || (downCount >= 3 && upCount <= 2)) {
    const majorityDirection = upCount > downCount ? 'up' : 'down';
    const minorityDirection = majorityDirection === 'up' ? 'down' : 'up';
    const divergentSectors = sectorMoves.filter(s => s.direction === minorityDirection);

    for (const divergent of divergentSectors) {
      const dedupeKey = generateDedupeKey('sector_divergence', divergent.symbol, divergent.change);
      
      if (isRecentDuplicate && isRecentDuplicate(dedupeKey)) continue;
      
      if (markSignalSeen) markSignalSeen(dedupeKey);

      signals.push({
        id: generateSignalId(),
        type: 'sector_cascade', // Using sector_cascade type as this is a variant
        title: `${divergent.name} diverging from market`,
        description: `${divergent.name} ${divergent.change > 0 ? '+' : ''}${divergent.change.toFixed(1)}% while most sectors move ${majorityDirection}`,
        confidence: Math.min(0.85, 0.5 + Math.abs(divergent.change) / 10),
        timestamp: new Date(),
        data: {
          divergentSector: divergent.name,
          sectorChange: divergent.change,
          marketDirection: majorityDirection,
          explanation: `${divergent.name} moving opposite to majority of sectors`,
        },
      });
    }
  }

  return signals;
}

/**
 * Main sector cascade orchestrator
 */
export function analyzeSectorCascade(markets, isRecentDuplicate, markSignalSeen) {
  const signals = [];
  
  signals.push(...detectSectorCascade(markets, isRecentDuplicate, markSignalSeen));
  signals.push(...detectSectorDivergence(markets, isRecentDuplicate, markSignalSeen));
  
  return signals.sort((a, b) => b.confidence - a.confidence);
}
