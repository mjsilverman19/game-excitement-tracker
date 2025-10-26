#!/usr/bin/env node

/**
 * Express server to serve the Game Excitement Tracker frontend and API
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import liveGviHandler from './api/gvi-live.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// API endpoint for live GVI - delegate to existing handler
app.get('/api/gvi-live', (req, res) => {
  return liveGviHandler(req, res);
});

// Fallback to serve index.html for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Game Excitement Tracker server running on http://localhost:${PORT}`);
  console.log(`📊 Live GVI API available at http://localhost:${PORT}/api/gvi-live`);
});