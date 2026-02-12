import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = 5175;

// Enable JSON body parsing
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper to convert Express req to Web API Request
function createWebRequest(req, baseUrl) {
  const url = new URL(req.url, baseUrl);
  const headers = new Headers();
  
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  });

  const init = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }

  return new Request(url.toString(), init);
}

// Helper to convert Web API Response to Express response
async function sendWebResponse(webResponse, res) {
  res.status(webResponse.status);
  
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const contentType = webResponse.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    const data = await webResponse.json();
    res.json(data);
  } else if (contentType.includes('text/')) {
    const text = await webResponse.text();
    res.send(text);
  } else {
    const buffer = await webResponse.arrayBuffer();
    res.send(Buffer.from(buffer));
  }
}

// Dynamic route loader for all api/*.js files
async function loadApiRoutes() {
  const apiDir = join(__dirname, '../api');
  const files = fs.readdirSync(apiDir, { recursive: true });
  
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    if (file.startsWith('_')) continue; // Skip utility files like _cors.js, _cache.js
    
    const modulePath = join(apiDir, file);
    const routePath = file
      .replace(/\.js$/, '')
      .replace(/\[\[\.\.\.(\w+)\]\]/g, '*') // [[...path]] -> *
      .replace(/\[(\w+)\]/g, ':$1'); // [id] -> :id
    
    try {
      const module = await import(`file://${modulePath}`);
      const handler = module.default;
      
      if (typeof handler !== 'function') {
        console.warn(`⚠️  ${file} doesn't export a default handler function`);
        continue;
      }
      
      // Register route for all HTTP methods
      const fullRoute = `/api/${routePath}`;
      
      app.all(fullRoute, async (req, res) => {
        try {
          const baseUrl = `http://localhost:${PORT}`;
          const webRequest = createWebRequest(req, baseUrl);
          const webResponse = await handler(webRequest);
          await sendWebResponse(webResponse, res);
        } catch (error) {
          console.error(`Error in ${file}:`, error);
          res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
          });
        }
      });
      
      console.log(`✓ Loaded ${fullRoute}`);
    } catch (error) {
      console.error(`✗ Failed to load ${file}:`, error.message);
    }
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
(async () => {
  await loadApiRoutes();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 World Monitor API Server running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });
})();
