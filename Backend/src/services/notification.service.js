'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const { notificationRepository } = require('../notifications/notification.repository');
const { connectionManager } = require('../websocket/websocket.connection-manager');
const auditLogRepository = require('../repositories/auditLog.repository');
const { redactSensitive } = require('../utils/redaction');
const {
  NOTIFICATION_TYPES,
  NOTIFICATION_SEVERITIES,
  WS_OUTBOUND_TYPES,
  NOTIFICATION_AUDIT_ACTIONS,
} = require('../notifications/notificationTypes');

/**
 * NotificationService — Centralized notification and WebSocket delivery service.
 *
 * NOTIFICATION AUTHORITY INVARIANT:
 * - This service communicates trusted backend state.
 * - It CANNOT grant permissions, approve actions, execute recovery, or alter severity.
 * - All outgoing notification payloads are sanitized via redactSensitive (zero secrets).
 * - Reliable delivery: notifications are persisted before WebSocket dispatch; offline users
 *   retrieve unread notifications via REST upon reconnection.
 */
class NotificationService {
  /**
   * Creates, persists, and delivers a user notification.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.type - NOTIFICATION_TYPES value
   * @param {string} [params.severity='INFO'] - NOTIFICATION_SEVERITIES value
   * @param {string} params.title
   * @param {string} [params.message='']
   * @param {string|null} [params.incidentId]
   * @param {string|null} [params.recoveryActionId]
   * @param {string|null} [params.approvalId]
   * @param {string|null} [params.correlationId]
   * @param {object|null} [params.metadata]
   * @param {string|null} [params.deduplicationKey]
   * @returns {Promise<object>} Created or deduplicated notification DTO
   */
  async createNotification(params) {
    if (!params.userId) throw new Error('userId is required for notification');
    if (!params.type) throw new Error('type is required for notification');
    if (!params.title) throw new Error('title is required for notification');

    // 1. Compute default deduplication key if not supplied
    const dedupKey = params.deduplicationKey ||
      `${params.userId}:${params.type}:${params.incidentId || params.recoveryActionId || ''}:${params.correlationId || ''}`;

    // 2. Validate and clamp severity
    const validSeverities = Object.values(NOTIFICATION_SEVERITIES);
    const severity = validSeverities.includes(params.severity)
      ? params.severity
      : NOTIFICATION_SEVERITIES.INFO;

    // 3. Sanitize content and metadata (Strict Zero-Secret Protection)
    const sanitizedTitle = typeof params.title === 'string' ? params.title.slice(0, 256) : '';
    const sanitizedMessage = typeof params.message === 'string' ? params.message.slice(0, 1024) : '';
    const sanitizedMeta = params.metadata ? redactSensitive(params.metadata) : null;

    // 4. Persist notification in repository (reliable storage before dispatch)
    const { notification, isDuplicate } = await notificationRepository.create({
      userId: params.userId,
      type: params.type,
      severity,
      title: sanitizedTitle,
      message: sanitizedMessage,
      incidentId: params.incidentId || null,
      recoveryActionId: params.recoveryActionId || null,
      approvalId: params.approvalId || null,
      correlationId: params.correlationId || null,
      metadata: sanitizedMeta,
      deduplicationKey: dedupKey,
    });

    // 5. If duplicate, skip WebSocket broadcast and audit log
    if (isDuplicate) {
      return this._toDto(notification, true);
    }

    // 6. Audit: NOTIFICATION_CREATED
    await auditLogRepository.create({
      userId: params.userId,
      incidentId: params.incidentId || null,
      actorType: 'SYSTEM',
      actorId: 'notification-service',
      actionType: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_CREATED,
      targetType: 'Notification',
      targetId: notification.id,
      result: 'SUCCESS',
      correlationId: params.correlationId || null,
      metadata: { type: notification.type, severity: notification.severity },
    });

    // 7. Dispatch to active WebSocket connections
    const dto = this._toDto(notification);
    const envelope = {
      type: WS_OUTBOUND_TYPES.NOTIFICATION,
      notification: dto,
    };

    const deliveredCount = connectionManager.sendToUser(params.userId, envelope);

    // 8. Audit delivery outcome
    if (deliveredCount > 0) {
      await auditLogRepository.create({
        userId: params.userId,
        incidentId: params.incidentId || null,
        actorType: 'SYSTEM',
        actorId: 'notification-service',
        actionType: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_DELIVERED,
        targetType: 'Notification',
        targetId: notification.id,
        result: 'SUCCESS',
        correlationId: params.correlationId || null,
        metadata: { deliveredSockets: deliveredCount },
      });
    }

    return dto;
  }

  /**
   * Retrieves paginated notifications for a user.
   *
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<{ notifications: Array<object>, pagination: object }>}
   */
  async getNotifications(userId, options = {}) {
    const result = await notificationRepository.listByUserId(userId, options);
    return {
      notifications: result.notifications.map((n) => this._toDto(n)),
      pagination: result.pagination,
    };
  }

  /**
   * Retrieves unread notifications for a user (offline catchup).
   *
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<{ notifications: Array<object>, pagination: object }>}
   */
  async getUnreadNotifications(userId, options = {}) {
    return await this.getNotifications(userId, { ...options, unreadOnly: true });
  }

  /**
   * Retrieves a single notification by ID enforcing tenant isolation.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getNotificationById(id, userId) {
    const notif = await notificationRepository.findById(id);
    if (!notif || notif.userId !== userId) {
      return null;
    }
    return this._toDto(notif);
  }

  /**
   * Marks an individual notification as read.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async markAsRead(id, userId) {
    const updated = await notificationRepository.markAsRead(id, userId);
    if (!updated) return null;

    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_READ,
      targetType: 'Notification',
      targetId: id,
      result: 'SUCCESS',
    });

    return this._toDto(updated);
  }

  /**
   * Marks all notifications for a user as read.
   *
   * @param {string} userId
   * @returns {Promise<{ updatedCount: number }>}
   */
  async markAllAsRead(userId) {
    const updatedCount = await notificationRepository.markAllAsRead(userId);

    await auditLogRepository.create({
      userId,
      actorType: 'USER',
      actorId: userId,
      actionType: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_READ_ALL,
      targetType: 'Notification',
      result: 'SUCCESS',
      metadata: { count: updatedCount },
    });

    return { updatedCount };
  }

  // ── Lifecycle Event Helper Dispatchers ─────────────────────────────────────

  /**
   * Dispatches an INCIDENT_CREATED notification.
   */
  async notifyIncidentCreated({ incident, correlationId }) {
    if (!incident) return null;
    return await this.createNotification({
      userId: incident.userId,
      type: NOTIFICATION_TYPES.INCIDENT_CREATED,
      severity: incident.severity || NOTIFICATION_SEVERITIES.HIGH,
      title: `Security incident detected: ${incident.title}`,
      message: incident.summary || 'A new security incident has been identified by the detection engine.',
      incidentId: incident.id,
      correlationId,
    });
  }

  /**
   * Dispatches a RECOVERY_APPROVAL_REQUIRED notification.
   */
  async notifyApprovalRequired({ incident, recoveryAction, approval, correlationId }) {
    if (!recoveryAction || !incident) return null;
    return await this.createNotification({
      userId: incident.userId,
      type: NOTIFICATION_TYPES.RECOVERY_APPROVAL_REQUIRED,
      severity: recoveryAction.riskLevel || NOTIFICATION_SEVERITIES.HIGH,
      title: `Approval Required: ${recoveryAction.actionType}`,
      message: `Recovery action '${recoveryAction.actionType}' requires explicit authorization.`,
      incidentId: incident.id,
      recoveryActionId: recoveryAction.id,
      approvalId: approval ? approval.id : null,
      correlationId,
    });
  }

  /**
   * Dispatches an APPROVAL_GRANTED or APPROVAL_REJECTED notification.
   */
  async notifyApprovalDecided({ approval, recoveryAction, decision, correlationId }) {
    if (!approval) return null;
    const type = decision === 'APPROVED'
      ? NOTIFICATION_TYPES.APPROVAL_GRANTED
      : NOTIFICATION_TYPES.APPROVAL_REJECTED;

    return await this.createNotification({
      userId: approval.userId,
      type,
      severity: NOTIFICATION_SEVERITIES.INFO,
      title: `Recovery action ${decision.toLowerCase()}`,
      message: `Approval for recovery action '${recoveryAction?.actionType || ''}' was ${decision.toLowerCase()}.`,
      incidentId: approval.incidentId,
      recoveryActionId: approval.recoveryActionId,
      approvalId: approval.id,
      correlationId,
    });
  }

  /**
   * Dispatches a RECOVERY_STARTED, RECOVERY_COMPLETED, or RECOVERY_FAILED notification.
   */
  async notifyRecoveryStatus({ userId, incidentId, recoveryAction, status, correlationId, error }) {
    if (!recoveryAction || !userId) return null;
    let type = NOTIFICATION_TYPES.RECOVERY_COMPLETED;
    let severity = NOTIFICATION_SEVERITIES.INFO;
    let title = `Recovery completed: ${recoveryAction.actionType}`;
    let message = `Action '${recoveryAction.actionType}' executed successfully.`;

    if (status === 'EXECUTING') {
      type = NOTIFICATION_TYPES.RECOVERY_STARTED;
      title = `Recovery started: ${recoveryAction.actionType}`;
      message = `Action '${recoveryAction.actionType}' is now executing.`;
    } else if (status === 'FAILED') {
      type = NOTIFICATION_TYPES.RECOVERY_FAILED;
      severity = NOTIFICATION_SEVERITIES.HIGH;
      title = `Recovery failed: ${recoveryAction.actionType}`;
      message = `Action '${recoveryAction.actionType}' failed: ${error || 'Unknown error'}.`;
    }

    return await this.createNotification({
      userId,
      type,
      severity,
      title,
      message,
      incidentId,
      recoveryActionId: recoveryAction.id,
      correlationId,
    });
  }

  /**
   * Dispatches a PERSISTENCE_DETECTED notification.
   */
  async notifyPersistenceDetected({ incident, persistenceItems = [], correlationId }) {
    if (!incident) return null;
    const count = persistenceItems.length;
    return await this.createNotification({
      userId: incident.userId,
      type: NOTIFICATION_TYPES.PERSISTENCE_DETECTED,
      severity: NOTIFICATION_SEVERITIES.HIGH,
      title: 'Attacker persistence detected post-recovery',
      message: `${count} lingering persistence mechanism(s) detected during verification.`,
      incidentId: incident.id,
      correlationId,
    });
  }

  /**
   * Dispatches a REINVESTIGATION_TRIGGERED notification.
   */
  async notifyReinvestigationTriggered({ incident, trigger, correlationId }) {
    if (!incident) return null;
    return await this.createNotification({
      userId: incident.userId,
      type: NOTIFICATION_TYPES.REINVESTIGATION_TRIGGERED,
      severity: NOTIFICATION_SEVERITIES.HIGH,
      title: 'Automated re-investigation initiated',
      message: `Re-investigation cycle ${trigger?.cycleNumber || 1} triggered due to persistence findings.`,
      incidentId: incident.id,
      sourceRecoveryActionId: trigger?.sourceRecoveryActionId || null,
      correlationId,
    });
  }

  /**
   * Dispatches an INCIDENT_RESOLVED notification.
   */
  async notifyIncidentResolved({ incident, correlationId }) {
    if (!incident) return null;
    return await this.createNotification({
      userId: incident.userId,
      type: NOTIFICATION_TYPES.INCIDENT_RESOLVED,
      severity: NOTIFICATION_SEVERITIES.INFO,
      title: `Incident resolved: ${incident.title}`,
      message: 'All recovery actions verified and no attacker persistence remains.',
      incidentId: incident.id,
      correlationId,
    });
  }

  /**
   * Dispatches a real-time account security alert across WebSockets and Notification Center.
   * Enforces deterministic deduplication using providerEventId, incidentId, and eventType.
   */
  async notifyAccountSecurityAlert({
    userId,
    provider,
    eventType,
    severity = NOTIFICATION_SEVERITIES.HIGH,
    title,
    message,
    incidentId = null,
    device = null,
    location = null,
    timestamp = null,
    source = null,
    providerEventId = null,
    correlationId = null,
    metadata = null,
  }) {
    if (!userId) return null;

    // Deterministic dedup key
    const dedupKey = `security-alert:${userId}:${provider}:${providerEventId || ''}:${incidentId || ''}:${eventType}`;

    const enrichedMetadata = {
      provider,
      eventType,
      device: device || null,
      location: location || null,
      timestamp: timestamp || new Date().toISOString(),
      source: source || `${provider} Security API`,
      providerEventId: providerEventId || null,
      ...(metadata || {}),
    };

    const notification = await this.createNotification({
      userId,
      type: NOTIFICATION_TYPES.SECURITY_ALERT,
      severity,
      title: title || `🚨 Security Alert: ${provider} ${eventType.replace(/_/g, ' ')}`,
      message: message || `A critical security event was detected on your connected ${provider} account.`,
      incidentId,
      correlationId,
      metadata: enrichedMetadata,
      deduplicationKey: dedupKey,
    });

    // Also dispatch direct WS_OUTBOUND_TYPES.SECURITY_ALERT frame for immediate client banner trigger
    if (!notification.isDuplicate) {
      const alertEnvelope = {
        type: WS_OUTBOUND_TYPES.SECURITY_ALERT,
        alert: {
          id: notification.id,
          provider,
          eventType,
          severity,
          title: notification.title,
          message: notification.message,
          incidentId,
          device,
          location,
          timestamp: timestamp || new Date().toISOString(),
          source: source || `${provider} Security API`,
          metadata: enrichedMetadata,
        },
      };
      connectionManager.sendToUser(userId, alertEnvelope);
    }

    return notification;
  }

  /**
   * Serializes a notification to a clean, safe DTO.
   * @private
   */
  _toDto(notif, isDuplicate = false) {
    return {
      id: notif.id,
      userId: notif.userId,
      type: notif.type,
      severity: notif.severity,
      title: notif.title,
      message: notif.message,
      incidentId: notif.incidentId,
      recoveryActionId: notif.recoveryActionId,
      approvalId: notif.approvalId,
      correlationId: notif.correlationId,
      read: notif.read,
      readAt: notif.readAt,
      createdAt: notif.createdAt,
      isDuplicate: Boolean(isDuplicate),
    };
  }
}

const notificationService = new NotificationService();

module.exports = {
  NotificationService,
  notificationService,
};
