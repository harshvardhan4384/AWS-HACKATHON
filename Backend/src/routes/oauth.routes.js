'use strict';

const express = require('express');
const oauthController = require('../controllers/oauth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// List supported providers and capability status
router.get('/providers', authenticate, oauthController.listProviders);

// Global aggregated security overview across all connected accounts
router.get('/security-overview', authenticate, oauthController.getAggregatedOverview);

// Connected account management & detailed security overview
router.get('/connected', authenticate, oauthController.listConnected);
router.get('/connected/:id/security-overview', authenticate, oauthController.getSecurityOverview);
router.post('/connected/:id/sync', authenticate, oauthController.sync);
router.delete('/connected/:id', authenticate, oauthController.disconnect);

// Push webhooks (unauthenticated at HTTP layer, cryptographically validated via webhook token/signature)
router.post('/webhooks/google-reports', oauthController.googleReportsWebhook);

// OAuth flow lifecycle (start and callback are strictly gated behind Re:COVER user session)
router.get('/:provider/start', authenticate, oauthController.start);
router.get('/:provider/callback', authenticate, oauthController.callback);

module.exports = router;

