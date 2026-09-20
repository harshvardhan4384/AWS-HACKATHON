/**
 * Re:COVER Native WebSocket Service
 * 
 * Manages authenticated, real-time WebSocket connection to the backend (/ws).
 * 
 * SECURITY INVARIANTS:
 * - Session token is NEVER transmitted in the WebSocket URL or query string.
 * - Browser HttpOnly session cookie (recover_session) is used automatically during upgrade.
 * - Inbound messages are strictly parsed and validated against expected schemas.
 * - Bounded exponential backoff reconnection prevents flooding or runaway loops.
 * - Client-side operations are restricted to notification acknowledgments.
 */

export const WS_CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
});

class WebSocketService {
  constructor() {
    this._ws = null;
    this._state = WS_CONNECTION_STATES.DISCONNECTED;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._pingTimer = null;
    this._isExplicitlyClosed = false;

    // Listeners: Set of callbacks
    this._stateListeners = new Set();
    this._notificationListeners = new Set();
    this._errorListeners = new Set();

    // Reconnection parameters (bounded exponential backoff)
    this._baseDelayMs = 1000;
    this._maxDelayMs = 30000;
    this._maxBackoffExponent = 5;

    // Keepalive ping interval (25 seconds)
    this._pingIntervalMs = 25000;

    // Browser network listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._handleNetworkOnline());
      window.addEventListener('offline', () => this._handleNetworkOffline());
    }
  }

  /**
   * Derives clean WebSocket URL targeting /ws without any tokens or query params.
   * @private
   */
  _getWebSocketUrl() {
    const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000')).replace(/\/+$/, '');
    try {
      const parsed = new URL(rawApiUrl);
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${parsed.host}/ws`;
    } catch {
      return 'ws://localhost:5000/ws';
    }
  }

  /**
   * Current connection state.
   */
  getState() {
    return this._state;
  }

  /**
   * Registers a connection state listener.
   * @param {Function} callback (state) => void
   * @returns {Function} unsubscribe function
   */
  onStateChange(callback) {
    this._stateListeners.add(callback);
    callback(this._state);
    return () => this._stateListeners.delete(callback);
  }

  /**
   * Registers a notification listener.
   * @param {Function} callback (notificationDto) => void
   * @returns {Function} unsubscribe function
   */
  onNotification(callback) {
    this._notificationListeners.add(callback);
    return () => this._notificationListeners.delete(callback);
  }

  /**
   * Registers an error listener.
   * @param {Function} callback (error) => void
   * @returns {Function} unsubscribe function
   */
  onError(callback) {
    this._errorListeners.add(callback);
    return () => this._errorListeners.delete(callback);
  }

  /**
   * Transitions connection state and notifies all subscribers.
   * @private
   */
  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    for (const listener of this._stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error('[WebSocket] Error in state listener:', err);
      }
    }
  }

  /**
   * Establishes authenticated WebSocket connection using browser cookie.
   */
  connect() {
    if (typeof window === 'undefined') return;

    // If browser is offline, transition to OFFLINE and defer
    if (!navigator.onLine) {
      this._setState(WS_CONNECTION_STATES.OFFLINE);
      return;
    }

    // Prevent duplicate connection attempts
    if (
      this._ws &&
      (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this._isExplicitlyClosed = false;
    this._clearReconnectTimer();

    const wsUrl = this._getWebSocketUrl();
    this._setState(
      this._reconnectAttempts > 0
        ? WS_CONNECTION_STATES.RECONNECTING
        : WS_CONNECTION_STATES.CONNECTING
    );

    try {
      // NOTE: Never append ?token=...; session cookie is automatically forwarded
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => this._handleOpen();
      this._ws.onmessage = (event) => this._handleMessage(event);
      this._ws.onerror = (event) => this._handleError(event);
      this._ws.onclose = (event) => this._handleClose(event);
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Handles WebSocket open event.
   * @private
   */
  _handleOpen() {
    // We stay in CONNECTING / transition to CONNECTED once server welcome frame arrives
    // or immediately upon open
    this._reconnectAttempts = 0;
    this._startPingInterval();
  }

  /**
   * Handles incoming WebSocket messages safely.
   * @private
   */
  _handleMessage(event) {
    if (!event || typeof event.data !== 'string') return;

    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      // Ignore malformed non-JSON frame
      return;
    }

    if (!payload || typeof payload !== 'object' || !payload.type) {
      return;
    }

    switch (payload.type) {
      case 'CONNECTED': {
        // Welcome frame from server
        this._setState(WS_CONNECTION_STATES.CONNECTED);
        break;
      }

      case 'NOTIFICATION': {
        // Real-time notification frame
        if (payload.notification && typeof payload.notification === 'object' && payload.notification.id) {
          this._dispatchNotification(payload.notification);
        }
        break;
      }

      case 'PONG': {
        // Keepalive acknowledged
        break;
      }

      case 'NOTIFICATION_READ_ACK':
      case 'NOTIFICATIONS_READ_ALL_ACK': {
        // Server acknowledgments
        break;
      }

      case 'ERROR': {
        console.warn('[WebSocket] Server notice:', payload.message || 'Unknown error');
        break;
      }

      default: {
        // Ignore unrecognized frame types gracefully
        break;
      }
    }
  }

  /**
   * Dispatches validated notification to registered listeners.
   * @private
   */
  _dispatchNotification(notification) {
    for (const listener of this._notificationListeners) {
      try {
        listener(notification);
      } catch (err) {
        console.error('[WebSocket] Error in notification listener:', err);
      }
    }
  }

  /**
   * Handles connection error.
   * @private
   */
  _handleError(err) {
    for (const listener of this._errorListeners) {
      try {
        listener(err);
      } catch {}
    }
  }

  /**
   * Handles connection close and manages backoff reconnection.
   * @private
   */
  _handleClose(event) {
    this._stopPingInterval();
    this._ws = null;

    if (this._isExplicitlyClosed) {
      this._setState(WS_CONNECTION_STATES.DISCONNECTED);
      return;
    }

    // If closed due to authentication failure (401 or policy close 1008)
    if (event && (event.code === 1008 || event.code === 4401)) {
      this._setState(WS_CONNECTION_STATES.ERROR);
      return;
    }

    // Schedule bounded exponential backoff reconnect
    this._scheduleReconnect();
  }

  /**
   * Computes next backoff delay and schedules reconnect.
   * @private
   */
  _scheduleReconnect() {
    if (this._isExplicitlyClosed) return;
    if (typeof window !== 'undefined' && !navigator.onLine) {
      this._setState(WS_CONNECTION_STATES.OFFLINE);
      return;
    }

    this._setState(WS_CONNECTION_STATES.RECONNECTING);
    this._clearReconnectTimer();

    // Bounded exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(
      this._baseDelayMs * Math.pow(2, Math.min(this._reconnectAttempts, this._maxBackoffExponent)),
      this._maxDelayMs
    );

    this._reconnectAttempts++;

    this._reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Clears active reconnection timer.
   * @private
   */
  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Starts periodic application keepalive ping.
   * @private
   */
  _startPingInterval() {
    this._stopPingInterval();
    this._pingTimer = setInterval(() => {
      this.sendPing();
    }, this._pingIntervalMs);
  }

  /**
   * Stops periodic keepalive ping.
   * @private
   */
  _stopPingInterval() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Sends keepalive ping frame to server.
   */
  sendPing() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({ type: 'PING' }));
      } catch {}
    }
  }

  /**
   * Sends notification read acknowledgment.
   * @param {string} notificationId
   */
  sendNotificationRead(notificationId) {
    if (!notificationId || typeof notificationId !== 'string') return;
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({
          type: 'NOTIFICATION_READ',
          notificationId,
        }));
      } catch {}
    }
  }

  /**
   * Sends mark-all-read acknowledgment.
   */
  sendNotificationsReadAll() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({
          type: 'NOTIFICATIONS_READ_ALL',
        }));
      } catch {}
    }
  }

  /**
   * Handles browser returning online.
   * @private
   */
  _handleNetworkOnline() {
    if (this._isExplicitlyClosed) return;
    if (this._state === WS_CONNECTION_STATES.OFFLINE || this._state === WS_CONNECTION_STATES.DISCONNECTED) {
      this._reconnectAttempts = 0;
      this.connect();
    }
  }

  /**
   * Handles browser going offline.
   * @private
   */
  _handleNetworkOffline() {
    this._clearReconnectTimer();
    this._stopPingInterval();
    if (this._ws) {
      try {
        this._ws.close();
      } catch {}
      this._ws = null;
    }
    this._setState(WS_CONNECTION_STATES.OFFLINE);
  }

  /**
   * Closes connection cleanly and resets all reconnect timers.
   */
  disconnect() {
    this._isExplicitlyClosed = true;
    this._clearReconnectTimer();
    this._stopPingInterval();
    this._reconnectAttempts = 0;

    if (this._ws) {
      try {
        this._ws.close(1000, 'Normal Closure');
      } catch {}
      this._ws = null;
    }

    this._setState(WS_CONNECTION_STATES.DISCONNECTED);
  }
}

// Global singleton instance
export const websocketService = new WebSocketService();
export default websocketService;

