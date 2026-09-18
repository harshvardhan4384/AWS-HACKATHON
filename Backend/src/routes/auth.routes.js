'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Public auth routes (rate limited)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Session revocation (public/authenticated — clears cookie and invalidates session)
router.post('/logout', authController.logout);

// Protected routes (require valid session)
router.get('/me', authenticate, authController.getMe);
router.get('/protected', authenticate, authController.getProtected);

module.exports = router;

