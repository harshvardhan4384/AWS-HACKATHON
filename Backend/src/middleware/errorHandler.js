'use strict';

const config = require('../config/env');

/**
 * 404 handler — catches requests that matched no route.
 * Passes a structured error to the centralized error handler.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

/**
 * Centralized error handler.
 * - Consistent JSON error format
 * - Correct HTTP status codes
 * - Handles ZodError gracefully
 * - No stack traces in production
 * - No secrets, credentials, or env vars exposed
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.name === 'ZodError') {
    const issues = err.issues || err.errors || [];
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
      },
    });
  }

  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
};

module.exports = { notFound, errorHandler };
