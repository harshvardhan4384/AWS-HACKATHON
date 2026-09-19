'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const config = require('./src/config/env');
const { initWebSocketServer, closeWebSocketServer } = require('./src/websocket/websocket.server');

const server = http.createServer(app);

// Initialize WebSocket server attached to HTTP server
initWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`Re:COVER Backend running on http://localhost:${config.port}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`${signal} received — shutting down gracefully`);
  closeWebSocketServer();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));