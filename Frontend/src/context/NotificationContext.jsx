import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { websocketService, WS_CONNECTION_STATES } from '../services/websocket';
import { useSecurity } from './SecurityContext';

const NotificationContext = createContext(undefined);

export const NotificationProvider = ({ children }) => {
  const { currentUser, addToast } = useSecurity();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionState, setConnectionState] = useState(websocketService.getState());

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  /**
   * Loads notifications from backend REST API (provides offline catch-up).
   */
  const fetchNotifications = useCallback(async () => {
    if (!currentUserRef.current) return;
    try {
      setIsLoading(true);
      setError(null);

      const res = await api.get('/api/notifications', { params: { limit: 50 } });
      const rawList = (res && Array.isArray(res.notifications)) ? res.notifications : [];
      const computedUnread = res && res.pagination && typeof res.pagination.unreadCount === 'number'
        ? res.pagination.unreadCount
        : rawList.filter(n => !n.read).length;

      setNotifications(rawList);
      setUnreadCount(computedUnread);
    } catch (err) {
      // 401 is expected if session is unauthenticated
      if (err.status !== 401) {
        setError(err.message || 'Failed to retrieve notifications');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Real-time notification handler from WebSocket.
   */
  const handleIncomingNotification = useCallback((newNotif) => {
    if (!newNotif || !newNotif.id) return;

    setNotifications((prev) => {
      const existingIndex = prev.findIndex((n) => n.id === newNotif.id);
      if (existingIndex >= 0) {
        // Update existing notification in place (deduplication)
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...newNotif };
        return updated;
      }
      // Prepend newly arrived notification
      return [newNotif, ...prev.slice(0, 49)];
    });

    if (!newNotif.read) {
      setUnreadCount((prev) => prev + 1);
    }

    // Trigger in-app toast based on notification severity
    const severityUpper = (newNotif.severity || 'INFO').toUpperCase();
    let toastType = 'info';
    if (severityUpper === 'CRITICAL') {
      toastType = 'error';
    } else if (severityUpper === 'HIGH' || severityUpper === 'MEDIUM') {
      toastType = 'warning';
    }

    if (addToast) {
      addToast(
        toastType,
        newNotif.title || 'Security Notification',
        newNotif.message || `Event: ${newNotif.type || 'System Event'}`
      );
    }

    // Trigger high-priority real-time security alert banner if critical/high security event
    if (newNotif.type === 'SECURITY_ALERT' || severityUpper === 'CRITICAL' || (severityUpper === 'HIGH' && newNotif.incidentId)) {
      setActiveAlert({
        id: newNotif.id,
        title: newNotif.title,
        message: newNotif.message,
        incidentId: newNotif.incidentId,
        provider: newNotif.metadata?.provider || 'ACCOUNT',
        device: newNotif.metadata?.device,
        location: newNotif.metadata?.location,
        timestamp: newNotif.metadata?.timestamp || newNotif.createdAt,
        source: newNotif.metadata?.source,
        metadata: newNotif.metadata,
      });
    }
  }, [addToast]);

  /**
   * WebSocket Lifecycle management bound to authenticated user session.
   */
  useEffect(() => {
    // Unsubscribe references
    const unsubState = websocketService.onStateChange((state) => {
      setConnectionState(state);
      // When connection transitions to CONNECTED, perform offline catch-up
      if (state === WS_CONNECTION_STATES.CONNECTED && currentUserRef.current) {
        fetchNotifications();
      }
    });

    const unsubNotification = websocketService.onNotification((notif) => {
      handleIncomingNotification(notif);
    });

    const unsubAlert = websocketService.onSecurityAlert((alert) => {
      setActiveAlert(alert);
    });

    return () => {
      unsubState();
      unsubNotification();
      unsubAlert();
    };
  }, [fetchNotifications, handleIncomingNotification]);

  /**
   * Tenant-isolation and session synchronization.
   * When currentUser changes (e.g. login / logout), resets or establishes connection.
   */
  useEffect(() => {
    if (currentUser) {
      // Connect WebSocket & load user's notifications
      websocketService.connect();
      fetchNotifications();
    } else {
      // User logged out: strictly tear down WebSocket and clear state (Tenant Isolation)
      websocketService.disconnect();
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
    }
  }, [currentUser, fetchNotifications]);

  /**
   * Marks an individual notification as read.
   */
  const markAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return;

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // Send WebSocket acknowledgment frame
    websocketService.sendNotificationRead(notificationId);

    // Call REST endpoint
    try {
      await api.post(`/api/notifications/${notificationId}/read`);
    } catch (err) {
      console.warn('[Notification] REST markAsRead notice:', err.message);
      // Catch-up refresh if discrepancy occurs
      fetchNotifications();
    }
  }, [fetchNotifications]);

  /**
   * Marks all notifications as read for current user.
   */
  const markAllAsRead = useCallback(async () => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);

    // Send WebSocket acknowledgment frame
    websocketService.sendNotificationsReadAll();

    // Call REST endpoint
    try {
      await api.post('/api/notifications/read-all');
    } catch (err) {
      console.warn('[Notification] REST markAllAsRead notice:', err.message);
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        activeAlert,
        dismissActiveAlert: () => setActiveAlert(null),
        isLoading,
        error,
        connectionState,
        isConnected: connectionState === WS_CONNECTION_STATES.CONNECTED,
        markAsRead,
        markAllAsRead,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;

