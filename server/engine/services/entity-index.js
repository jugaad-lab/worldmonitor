/**
 * Entity Index - ported from src/services/entity-index.ts
 * Fast lookup of entities by alias, keyword, sector
 */

import { ENTITY_REGISTRY } from '../config/entities.js';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildEntityIndex(entities) {
  const byId = new Map();
  const byAlias = new Map();
  const byKeyword = new Map();
  const bySector = new Map();
  const byType = new Map();

  for (const entity of entities) {
    byId.set(entity.id, entity);

    // Index all aliases
    for (const alias of entity.aliases) {
      byAlias.set(alias.toLowerCase(), entity.id);
    }
    byAlias.set(entity.id.toLowerCase(), entity.id);
    byAlias.set(entity.name.toLowerCase(), entity.id);

    // Index keywords
    for (const keyword of entity.keywords) {
      const kw = keyword.toLowerCase();
      if (!byKeyword.has(kw)) byKeyword.set(kw, new Set());
      byKeyword.get(kw).add(entity.id);
    }

    // Index sector
    if (entity.sector) {
      const sector = entity.sector.toLowerCase();
      if (!bySector.has(sector)) bySector.set(sector, new Set());
      bySector.get(sector).add(entity.id);
    }

    // Index type
    if (!byType.has(entity.type)) byType.set(entity.type, new Set());
    byType.get(entity.type).add(entity.id);
  }

  return { byId, byAlias, byKeyword, bySector, byType };
}

let cachedIndex = null;

export function getEntityIndex() {
  if (!cachedIndex) {
    cachedIndex = buildEntityIndex(ENTITY_REGISTRY);
  }
  return cachedIndex;
}

export function lookupEntityByAlias(alias) {
  const index = getEntityIndex();
  const id = index.byAlias.get(alias.toLowerCase());
  return id ? index.byId.get(id) : undefined;
}

export function lookupEntitiesByKeyword(keyword) {
  const index = getEntityIndex();
  const ids = index.byKeyword.get(keyword.toLowerCase());
  if (!ids) return [];
  return Array.from(ids)
    .map(id => index.byId.get(id))
    .filter(e => e !== undefined);
}

export function findRelatedEntities(entityId) {
  const index = getEntityIndex();
  const entity = index.byId.get(entityId);
  if (!entity?.related) return [];
  return entity.related.map(id => index.byId.get(id)).filter(e => !!e);
}

export function findEntitiesInText(text) {
  const index = getEntityIndex();
  const matches = [];
  const seen = new Set();
  const textLower = text.toLowerCase();

  // Match aliases (exact word boundaries)
  for (const [alias, entityId] of index.byAlias) {
    if (alias.length < 3) continue;

    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!seen.has(entityId)) {
        matches.push({
          entityId,
          matchedText: match[0],
          matchType: 'alias',
          confidence: alias.length > 4 ? 0.95 : 0.85,
          position: match.index,
        });
        seen.add(entityId);
        break;
      }
    }
  }

  // Match keywords (substring match)
  for (const [keyword, entityIds] of index.byKeyword) {
    if (keyword.length < 3) continue;
    if (!textLower.includes(keyword)) continue;

    for (const entityId of entityIds) {
      if (seen.has(entityId)) continue;

      const pos = textLower.indexOf(keyword);
      matches.push({
        entityId,
        matchedText: keyword,
        matchType: 'keyword',
        confidence: 0.7,
        position: pos,
      });
      seen.add(entityId);
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence || a.position - b.position);
}

export function getEntityDisplayName(entityId) {
  const index = getEntityIndex();
  const entity = index.byId.get(entityId);
  return entity?.name ?? entityId;
}
