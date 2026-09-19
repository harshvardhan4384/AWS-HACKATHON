'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const approvalController = require('../controllers/approval.controller');

// All approval routes require authentication
router.use(authenticate);

// GET /api/approvals — List approvals for authenticated user
router.get('/', approvalController.listApprovals);

// POST /api/approvals/:id/approve — Approve a pending approval and issue authorization
router.post('/:id/approve', approvalController.approve);

// POST /api/approvals/:id/reject — Reject a pending approval
router.post('/:id/reject', approvalController.reject);

module.exports = router;

