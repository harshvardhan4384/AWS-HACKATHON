'use strict';

const express = require('express');
const oauthController = require('../controllers/oauth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// List supported providers and capability status
router.get('/providers', authenticate, oauthController.listProviders);

// Connected account management
router.get('/connected', authenticate, oauthController.listConnected);
router.delete('/connected/:id', authenticate, oauthController.disconnect);

// OAuth flow lifecycle (start and callback are strictly gated behind Re:COVER user session)
router.get('/:provider/start', authenticate, oauthController.start);
router.get('/:provider/callback', authenticate, oauthController.callback);

module.exports = router;

