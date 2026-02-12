/**
 * News Clustering - ported from src/services/clustering.ts
 * Cluster similar news items using Jaccard similarity
 */

import { SIMILARITY_THRESHOLD, tokenize, jaccardSimilarity } from '../utils/analysis-constants.js';

function generateClusterId(items) {
  const sorted = [...items].sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
  const first = sorted[0];
  return `${first.pubDate.getTime()}-${first.title.slice(0, 20).replace(/\W/g, '')}`;
}

export function clusterNews(items, getSourceTier) {
  if (items.length === 0) return [];

  // Assign tiers
  const itemsWithTier = items.map(item => ({
    ...item,
    tier: item.tier ?? getSourceTier(item.source),
  }));

  // Tokenize all titles and build inverted index
  const tokenList = [];
  const invertedIndex = new Map();
  
  for (let index = 0; index < itemsWithTier.length; index++) {
    const item = itemsWithTier[index];
    const tokens = tokenize(item.title);
    tokenList.push(tokens);

    // Build inverted index for fast candidate finding
    for (const token of tokens) {
      const bucket = invertedIndex.get(token);
      if (bucket) {
        bucket.push(index);
      } else {
        invertedIndex.set(token, [index]);
      }
    }
  }

  // Cluster items
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < itemsWithTier.length; i++) {
    if (assigned.has(i)) continue;

    const currentItem = itemsWithTier[i];
    const cluster = [currentItem];
    assigned.add(i);
    const tokensI = tokenList[i];

    // Find candidate items that share at least one token
    const candidateIndices = new Set();
    for (const token of tokensI) {
      const bucket = invertedIndex.get(token);
      if (!bucket) continue;
      for (const idx of bucket) {
        if (idx > i) {
          candidateIndices.add(idx);
        }
      }
    }

    // Check similarity for candidates
    const sortedCandidates = Array.from(candidateIndices).sort((a, b) => a - b);
    for (const j of sortedCandidates) {
      if (assigned.has(j)) continue;

      const tokensJ = tokenList[j];
      const similarity = jaccardSimilarity(tokensI, tokensJ);

      if (similarity >= SIMILARITY_THRESHOLD) {
        cluster.push(itemsWithTier[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Convert to structured cluster objects
  return clusters.map(cluster => {
    const sorted = [...cluster].sort((a, b) => {
      const tierDiff = a.tier - b.tier;
      if (tierDiff !== 0) return tierDiff;
      return b.pubDate.getTime() - a.pubDate.getTime();
    });

    const primary = sorted[0];
    const dates = cluster.map(i => i.pubDate.getTime());

    const topSources = sorted
      .slice(0, 3)
      .map(item => ({
        name: item.source,
        tier: item.tier,
        url: item.link,
      }));

    return {
      id: generateClusterId(cluster),
      primaryTitle: primary.title,
      primarySource: primary.source,
      primaryLink: primary.link,
      sourceCount: cluster.length,
      topSources,
      allItems: cluster,
      firstSeen: new Date(Math.min(...dates)),
      lastUpdated: new Date(Math.max(...dates)),
      isAlert: cluster.some(i => i.isAlert),
    };
  }).sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
}
