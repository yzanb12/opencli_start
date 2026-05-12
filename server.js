// server.js
const express = require('express');
const path = require('path');
const { Cache } = require('./src/cache');
const { fetchAll } = require('./src/fetcher');

const app = express();
const cache = new Cache();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = 60 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (req, res) => {
  const platforms = cache.getAll();
  const timestamps = Object.values(platforms).map(p => p.updatedAt || 0);
  const updatedAt = timestamps.length ? Math.max(...timestamps) : null;
  res.json({ updatedAt, platforms });
});

async function refresh() {
  console.log('[refresh] Fetching all platforms...');
  const results = await fetchAll();
  for (const [platform, result] of Object.entries(results)) {
    if (result.status === 'ok') {
      cache.set(platform, result.items);
    } else {
      cache.setError(platform, result.error);
    }
  }
  console.log('[refresh] Done.');
}

// start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  setInterval(refresh, REFRESH_INTERVAL);
  refresh().catch(err => console.error('[refresh] Fatal error on startup:', err));
});
