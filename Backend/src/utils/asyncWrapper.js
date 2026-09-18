'use strict';

/**
 * Wraps an async route handler to forward any rejected promise to Express next().
 * Express 5 propagates async errors natively, but this wrapper makes intent explicit
 * and keeps handlers compatible if the version changes.
 *
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
const asyncWrapper = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncWrapper;

