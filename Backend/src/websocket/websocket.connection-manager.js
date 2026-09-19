'use strict';

const config = require('../config/env');
const { WS_OUTBOUND_TYPES } = require('../notifications/notificationTypes');

/**
 * WebSocketConnectionManager — Manages active WebSocket connections, heartbeat,
 * rate limiting, and tenant-isolated message dispatch.
 */
class WebSocketConnectionManager {
  constructor() {
    // Map<connectionId, ConnectionContext>
    this._connections = new Map();
    // Map<userId, Set<connectionId>>
    this._userConnections = new Map();

    this._heartbeatTimer = null;
  }

  /**
   * Starts the heartbeat ping/pong timer.
   *
   * @param {number} [intervalMs]
   */
  startHeartbeat(intervalMs = config.wsHeartbeatIntervalMs || 30000) {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);

    this._heartbeatTimer = setInterval(() => {
      this.checkHeartbeat();
    }, intervalMs);

    // Unref timer so Node process is not prevented from exiting
    if (this._heartbeatTimer.unref) {
      this._heartbeatTimer.unref();
    }
  }

  /**
   * Stops the heartbeat timer.
   */
  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Checks heartbeat status of all active connections.
   * Terminates dead connections that failed to respond with pong.
   */
  checkHeartbeat() {
    for (const [connectionId, conn] of this._connections.entries()) {
      if (!conn.isAlive) {
        // Did not respond to previous ping
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
        this.removeConnection(connectionId);
        continue;
      }

      // Mark as unacknowledged and send ping
      conn.isAlive = false;
      try {
        conn.ws.ping();
      } catch {
        this.removeConnection(connectionId);
      }
    }
  }

  /**
   * Marks a connection as alive (called upon receiving pong or client message).
   *
   * @param {string} connectionId
   */
  markAlive(connectionId) {
    const conn = this._connections.get(connectionId);
    if (conn) {
      conn.isAlive = true;
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Registers a newly authenticated connection.
   * Enforces server-wide and per-user connection limits.
   *
   * @param {object} params
   * @param {string} params.connectionId
   * @param {string} params.userId
   * @param {string} params.sessionId
   * @param {import('ws').WebSocket} params.ws
   * @returns {{ success: boolean, reason?: string }}
   */
  addConnection({ connectionId, userId, sessionId, ws }) {
    // 1. Total connection limit check
    const maxTotal = config.wsMaxTotalConnections || 1000;
    if (this._connections.size >= maxTotal) {
      return { success: false, reason: 'MAX_TOTAL_CONNECTIONS_REACHED' };
    }

    // 2. Per-user connection limit check
    const maxPerUser = config.wsMaxConnectionsPerUser || 5;
    let userSet = this._userConnections.get(userId);
    if (!userSet) {
      userSet = new Set();
      this._userConnections.set(userId, userSet);
    }

    if (userSet.size >= maxPerUser) {
      return { success: false, reason: 'MAX_USER_CONNECTIONS_REACHED' };
    }

    const conn = {
      connectionId,
      userId,
      sessionId,
      ws,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      isAlive: true,
      messageTimestamps: [],
    };

    this._connections.set(connectionId, conn);
    userSet.add(connectionId);

    return { success: true };
  }

  /**
   * Removes a connection when disconnected.
   *
   * @param {string} connectionId
   * @returns {object|null} Removed connection context
   */
  removeConnection(connectionId) {
    const conn = this._connections.get(connectionId);
    if (!conn) return null;

    this._connections.delete(connectionId);

    const userSet = this._userConnections.get(conn.userId);
    if (userSet) {
      userSet.delete(connectionId);
      if (userSet.size === 0) {
        this._userConnections.delete(conn.userId);
      }
    }

    return conn;
  }

  /**
   * Checks inbound message rate limit for a specific connection.
   *
   * @param {string} connectionId
   * @returns {boolean} True if allowed, False if rate limit exceeded
   */
  checkRateLimit(connectionId) {
    const conn = this._connections.get(connectionId);
    if (!conn) return false;

    const now = Date.now();
    const windowMs = 60000;
    const maxMsgs = config.wsMaxMessagesPerMinute || 120;

    // Filter timestamps within last 60 seconds
    conn.messageTimestamps = conn.messageTimestamps.filter((t) => (now - t) < windowMs);

    if (conn.messageTimestamps.length >= maxMsgs) {
      return false;
    }

    conn.messageTimestamps.push(now);
    return true;
  }

  /**
   * Sends a structured message to all active connections belonging to a user.
   *
   * @param {string} userId
   * @param {object} message
   * @returns {number} Count of successful connection deliveries
   */
  sendToUser(userId, message) {
    if (!userId) return 0;
    const userSet = this._userConnections.get(userId);
    if (!userSet || userSet.size === 0) {
      return 0;
    }

    const payload = JSON.stringify(message);
    let deliveredCount = 0;

    for (const connectionId of userSet) {
      const conn = this._connections.get(connectionId);
      if (conn && conn.ws && conn.ws.readyState === 1) { // 1 = WebSocket.OPEN
        try {
          conn.ws.send(payload);
          deliveredCount++;
        } catch {
          // socket error will trigger on('close')
        }
      }
    }

    return deliveredCount;
  }

  /**
   * Returns active connections count for a user.
   *
   * @param {string} userId
   * @returns {number}
   */
  getUserConnectionCount(userId) {
    const userSet = this._userConnections.get(userId);
    return userSet ? userSet.size : 0;
  }

  /**
   * Returns total active connections count.
   *
   * @returns {number}
   */
  getTotalConnectionCount() {
    return this._connections.size;
  }

  /**
   * Resets all connections (for cleanup/testing).
   */
  clear() {
    this.stopHeartbeat();
    for (const conn of this._connections.values()) {
      try {
        conn.ws.close(1000, 'Server cleanup');
      } catch {
        // ignore
      }
    }
    this._connections.clear();
    this._userConnections.clear();
  }
}

const connectionManager = new WebSocketConnectionManager();

module.exports = {
  WebSocketConnectionManager,
  connectionManager,
};

