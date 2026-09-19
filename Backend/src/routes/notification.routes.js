'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

// All notification routes require active user authentication
router.use(authenticate);

// GET /api/notifications — List notifications with pagination & filtering
router.get('/', notificationController.getNotifications);

// GET /api/notifications/unread — List unread notifications
router.get('/unread', notificationController.getUnreadNotifications);

// POST /api/notifications/read-all — Mark all user notifications as read
router.post('/read-all', notificationController.markAllAsRead);

// GET /api/notifications/:id — Get a single notification by ID
router.get('/:id', notificationController.getNotificationById);

// POST /api/notifications/:id/read — Mark an individual notification as read
router.post('/:id/read', notificationController.markAsRead);

module.exports = router;

