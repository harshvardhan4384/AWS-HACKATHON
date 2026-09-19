'use strict';

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const config = require('../config/env');
const authService = require('../services/auth.service');
const auditLogRepository = require('../repositories/auditLog.repository');
const { connectionManager } = require('./websocket.connection-manager');
const {
  WS_INBOUND_TYPES,
  WS_OUTBOUND_TYPES,
  NOTIFICATION_AUDIT_ACTIONS,
} = require('../notifications/notificationTypes');

let wssInstance = null;

/**
 * Extracts session token from HTTP upgrade request.
 * Checks Cookie header, Authorization header, and URL query params.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
function extractTokenFromUpgrade(req) {
  // 1. Check Cookies
  if (req.headers.cookie) {
    const cookieName = config.sessionCookieName || 'recover_session';
    const match = req.headers.cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  // 2. Check Authorization: Bearer <token>
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }

  // 3. Check query string ?token=...
  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) return tokenParam;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Initializes the WebSocket server on an HTTP server instance.
 *
 * @param {import('http').Server} server
 * @returns {WebSocketServer}
 */
function initWebSocketServer(server) {
  if (wssInstance) {
    return wssInstance;
  }

  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  connectionManager.startHeartbeat();

  server.on('upgrade', async (req, socket, head) => {
    // Only handle /ws path
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }

    const token = extractTokenFromUpgrade(req);
    if (!token) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }

    try {
      const authResult = await authService.validateSession(token);
      if (!authResult || !authResult.user || authResult.user.status !== 'ACTIVE') {
        await auditLogRepository.create({
          userId: null,
          actorType: 'SYSTEM',
          actorId: 'websocket-server',
          actionType: NOTIFICATION_AUDIT_ACTIONS.WEBSOCKET_AUTH_FAILED,
          result: 'FAILURE',
          metadata: { reason: 'INVALID_OR_EXPIRED_SESSION' },
        });

        socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, authResult);
      });
    } catch (err) {
      socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    }
  });

  wss.on('connection', (ws, req, authResult) => {
    const user = authResult.user;
    const session = authResult.session;
    const connectionId = crypto.randomUUID();

    // Register in connection manager
    const addResult = connectionManager.addConnection({
      connectionId,
      userId: user.id,
      sessionId: session.id,
      ws,
    });

    if (!addResult.success) {
      ws.close(1008, `Policy Violation: ${addResult.reason}`);
      return;
    }

    // Attach listeners SYNCHRONOUSLY before yielding to event loop
    // 1. Pong listener for heartbeat
    ws.on('pong', () => {
      connectionManager.markAlive(connectionId);
    });

    // 2. Inbound frame handling
    ws.on('message', async (data) => {
      connectionManager.markAlive(connectionId);

      // 1. Message size check
      const maxBytes = config.wsMaxMessageBytes || 16384;
      if (data.length > maxBytes) {
        try {
          ws.send(JSON.stringify({
            type: WS_OUTBOUND_TYPES.ERROR,
            message: 'Message size exceeds limit (16KB)',
          }));
        } catch {}
        ws.close(1009, 'Message Too Big');
        return;
      }

      // 2. Rate limit check
      if (!connectionManager.checkRateLimit(connectionId)) {
        try {
          ws.send(JSON.stringify({
            type: WS_OUTBOUND_TYPES.ERROR,
            message: 'Message rate limit exceeded',
          }));
        } catch {}
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      // 3. Parse JSON frame safely
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        try {
          ws.send(JSON.stringify({
            type: WS_OUTBOUND_TYPES.ERROR,
            message: 'Malformed JSON frame',
          }));
        } catch {}
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.type) {
        try {
          ws.send(JSON.stringify({
            type: WS_OUTBOUND_TYPES.ERROR,
            message: 'Invalid message structure: missing type',
          }));
        } catch {}
        return;
      }

      // 4. Handle client message types
      const { notificationService } = require('../services/notification.service');

      switch (parsed.type) {
        case WS_INBOUND_TYPES.PING: {
          try {
            ws.send(JSON.stringify({
              type: WS_OUTBOUND_TYPES.PONG,
              timestamp: new Date().toISOString(),
            }));
          } catch {}
          break;
        }

        case WS_INBOUND_TYPES.NOTIFICATION_READ: {
          if (!parsed.notificationId || typeof parsed.notificationId !== 'string') {
            try {
              ws.send(JSON.stringify({
                type: WS_OUTBOUND_TYPES.ERROR,
                message: 'Missing or invalid notificationId',
              }));
            } catch {}
            return;
          }

          const marked = await notificationService.markAsRead(parsed.notificationId, user.id);
          try {
            ws.send(JSON.stringify({
              type: 'NOTIFICATION_READ_ACK',
              notificationId: parsed.notificationId,
              success: Boolean(marked),
            }));
          } catch {}
          break;
        }

        case WS_INBOUND_TYPES.NOTIFICATIONS_READ_ALL: {
          const res = await notificationService.markAllAsRead(user.id);
          try {
            ws.send(JSON.stringify({
              type: 'NOTIFICATIONS_READ_ALL_ACK',
              count: res.updatedCount,
              updatedCount: res.updatedCount,
            }));
          } catch {}
          break;
        }

        default: {
          // Reject unknown or arbitrary client events (security barrier)
          try {
            ws.send(JSON.stringify({
              type: WS_OUTBOUND_TYPES.ERROR,
              message: `Unknown or unauthorized message type: ${parsed.type}`,
            }));
          } catch {}
          break;
        }
      }
    });

    // 3. Cleanup on disconnect
    ws.on('close', async () => {
      connectionManager.removeConnection(connectionId);
      await auditLogRepository.create({
        userId: user.id,
        actorType: 'USER',
        actorId: user.id,
        actionType: NOTIFICATION_AUDIT_ACTIONS.WEBSOCKET_DISCONNECTED,
        result: 'SUCCESS',
        metadata: { connectionId },
      });
    });

    ws.on('error', () => {
      connectionManager.removeConnection(connectionId);
    });

    // 4. Send welcome frame
    try {
      ws.send(JSON.stringify({
        type: WS_OUTBOUND_TYPES.CONNECTED,
        connectionId,
        userId: user.id,
        timestamp: new Date().toISOString(),
      }));
    } catch {
      // ignore
    }

    // 5. Audit connection establishment asynchronously
    auditLogRepository.create({
      userId: user.id,
      actorType: 'USER',
      actorId: user.id,
      actionType: NOTIFICATION_AUDIT_ACTIONS.WEBSOCKET_CONNECTED,
      result: 'SUCCESS',
      metadata: { connectionId },
    }).catch(() => {});
  });

  return wss;
}

/**
 * Closes the WebSocket server and clears all active connections.
 */
function closeWebSocketServer() {
  if (wssInstance) {
    connectionManager.clear();
    try {
      wssInstance.close();
    } catch {
      // ignore
    }
    wssInstance = null;
  }
}

module.exports = {
  initWebSocketServer,
  closeWebSocketServer,
  extractTokenFromUpgrade,
};
