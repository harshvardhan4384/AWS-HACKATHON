'use strict';

const { notificationService } = require('../services/notification.service');
const {
  uuidParamSchema,
  listNotificationsSchema,
  validate,
} = require('../validators/notification.validator');

/**
 * GET /api/notifications
 * Lists paginated notifications for the authenticated user with optional filtering.
 */
async function getNotifications(req, res, next) {
  try {
    const queryValidation = validate(listNotificationsSchema, req.query);
    if (queryValidation.error) {
      return res.status(400).json({ error: queryValidation.error });
    }

    const result = await notificationService.getNotifications(req.user.id, queryValidation.data);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/unread
 * Lists unread notifications for the authenticated user.
 */
async function getUnreadNotifications(req, res, next) {
  try {
    const queryValidation = validate(listNotificationsSchema, req.query);
    if (queryValidation.error) {
      return res.status(400).json({ error: queryValidation.error });
    }

    const result = await notificationService.getUnreadNotifications(req.user.id, queryValidation.data);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/:id
 * Retrieves an individual notification by ID enforcing tenant isolation.
 */
async function getNotificationById(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid notification ID: ${paramValidation.error}` });
    }

    const notification = await notificationService.getNotificationById(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      notification,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/:id/read
 * Marks a notification as read.
 */
async function markAsRead(req, res, next) {
  try {
    const paramValidation = validate(uuidParamSchema, req.params.id);
    if (paramValidation.error) {
      return res.status(400).json({ error: `Invalid notification ID: ${paramValidation.error}` });
    }

    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      notification,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/read-all
 * Marks all notifications for the authenticated user as read.
 */
async function markAllAsRead(req, res, next) {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getUnreadNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
};

