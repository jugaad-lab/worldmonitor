/**
 * Intelligence API - Serve computed intelligence data from correlation engine
 * Port: 5174
 */

import express from 'express';
import { startEngine, getCache } from './engine/correlation-engine.js';

const app = express();
const PORT = 5174;

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Routes
app.get('/signals', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.signals,
    count: cache.signals.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/correlations', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.correlations,
    count: cache.correlations.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/entities', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.entities,
    count: cache.entities.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/focal-points', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.focalPoints,
    count: cache.focalPoints.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/threats', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.threats,
    count: cache.threats.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/hotspots', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.hotspots,
    count: cache.hotspots.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/clusters', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.clusters,
    count: cache.clusters.length,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/macro', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.macro,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/cii', (req, res) => {
  const cache = getCache();
  res.json({
    data: cache.cii,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/all', (req, res) => {
  const cache = getCache();
  res.json({
    signals: cache.signals,
    correlations: cache.correlations,
    entities: cache.entities,
    focalPoints: cache.focalPoints,
    threats: cache.threats,
    hotspots: cache.hotspots,
    clusters: cache.clusters.slice(0, 10), // Top 10 for /all endpoint
    macro: cache.macro,
    cii: cache.cii,
    lastUpdate: cache.lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const cache = getCache();
  res.json({
    status: 'ok',
    lastUpdate: cache.lastUpdate,
    signalCount: cache.signals.length,
    correlationCount: cache.correlations.length,
    entityCount: cache.entities.length,
    timestamp: new Date().toISOString(),
  });
});

// Start server and correlation engine
app.listen(PORT, () => {
  console.log(`\n🧠 Intelligence API running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     /signals        - Correlation signals`);
  console.log(`     /correlations   - Market-news correlations`);
  console.log(`     /entities       - Extracted entities from news`);
  console.log(`     /focal-points   - Convergence zones`);
  console.log(`     /threats        - Threat-classified news`);
  console.log(`     /hotspots       - Hotspot escalation scores`);
  console.log(`     /clusters       - Top news clusters`);
  console.log(`     /macro          - Macro signals`);
  console.log(`     /cii            - Country instability scores`);
  console.log(`     /all            - Everything combined`);
  console.log(`     /health         - Health check\n`);
  
  // Start correlation engine (runs every 5 minutes)
  startEngine(5 * 60 * 1000);
});
