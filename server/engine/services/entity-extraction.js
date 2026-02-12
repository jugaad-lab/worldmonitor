/**
 * Entity Extraction - ported from src/services/entity-extraction.ts
 * Extract entities from news headlines
 */

import {
  findEntitiesInText,
  getEntityDisplayName,
  findRelatedEntities,
} from './entity-index.js';

export function extractEntitiesFromTitle(title) {
  const matches = findEntitiesInText(title);

  return matches.map(match => ({
    entityId: match.entityId,
    name: getEntityDisplayName(match.entityId),
    matchedText: match.matchedText,
    matchType: match.matchType,
    confidence: match.confidence,
  }));
}

export function extractEntitiesFromCluster(cluster) {
  const primaryEntities = extractEntitiesFromTitle(cluster.primaryTitle);
  const entityMap = new Map();

  for (const entity of primaryEntities) {
    if (!entityMap.has(entity.entityId)) {
      entityMap.set(entity.entityId, entity);
    }
  }

  // Extract from secondary items (with lower confidence)
  if (cluster.allItems && cluster.allItems.length > 1) {
    for (const item of cluster.allItems.slice(0, 5)) {
      const itemEntities = extractEntitiesFromTitle(item.title);
      for (const entity of itemEntities) {
        if (!entityMap.has(entity.entityId)) {
          entity.confidence *= 0.9;
          entityMap.set(entity.entityId, entity);
        }
      }
    }
  }

  const entities = Array.from(entityMap.values())
    .sort((a, b) => b.confidence - a.confidence);

  const primaryEntity = entities[0]?.entityId;

  const relatedEntityIds = new Set();
  for (const entity of entities) {
    const related = findRelatedEntities(entity.entityId);
    for (const rel of related) {
      relatedEntityIds.add(rel.id);
    }
  }

  return {
    clusterId: cluster.id,
    title: cluster.primaryTitle,
    entities,
    primaryEntity,
    relatedEntityIds: Array.from(relatedEntityIds),
  };
}

export function extractEntitiesFromClusters(clusters) {
  const contextMap = new Map();

  for (const cluster of clusters) {
    const context = extractEntitiesFromCluster(cluster);
    contextMap.set(cluster.id, context);
  }

  return contextMap;
}

export function findNewsForEntity(entityId, newsContexts) {
  const relatedIds = new Set([entityId]);
  const related = findRelatedEntities(entityId);
  for (const rel of related) {
    relatedIds.add(rel.id);
  }

  const matches = [];

  for (const [clusterId, context] of newsContexts) {
    const directMatch = context.entities.find(e => e.entityId === entityId);
    if (directMatch) {
      matches.push({
        clusterId,
        title: context.title,
        confidence: directMatch.confidence,
      });
      continue;
    }

    const relatedMatch = context.entities.find(e => relatedIds.has(e.entityId));
    if (relatedMatch) {
      matches.push({
        clusterId,
        title: context.title,
        confidence: relatedMatch.confidence * 0.8,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

export function findNewsForMarketSymbol(symbol, newsContexts) {
  return findNewsForEntity(symbol, newsContexts);
}

export function getTopEntitiesFromNews(newsContexts, limit = 10) {
  const entityStats = new Map();

  for (const context of newsContexts.values()) {
    for (const entity of context.entities) {
      const stats = entityStats.get(entity.entityId) ?? { count: 0, totalConfidence: 0 };
      stats.count++;
      stats.totalConfidence += entity.confidence;
      entityStats.set(entity.entityId, stats);
    }
  }

  return Array.from(entityStats.entries())
    .map(([entityId, stats]) => ({
      entityId,
      name: getEntityDisplayName(entityId),
      mentionCount: stats.count,
      avgConfidence: stats.totalConfidence / stats.count,
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limit);
}
