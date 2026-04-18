/**
 * HUB 2.0 — JWT Authentication Middleware
 *
 * Extracts and verifies a JWT from:
 *   1. Authorization: Bearer <token>  header  (API clients, mobile)
 *   2. hub_token cookie               (web browser)
 *
 * Attaches the decoded payload to req.user on success.
 * Calls next(ApiError.unauthorized()) on failure.
 */
'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config');
const { ApiError } = require('./errorHandler');
const logger = require('../logger');

/**
 * Strict auth — rejects the request if no valid token is found.
 */
function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Authentication token required');

    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch (err) {
    next(err.isApiError ? err : ApiError.unauthorized(err.message));
  }
}

/**
 * Optional auth — attaches req.user if a valid token is present,
 * otherwise continues without blocking.
 */
function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      req.user = jwt.verify(token, config.jwt.secret);
    }
  } catch (_) {
    // Silently ignore invalid optional tokens
  }
  next();
}

/**
 * Admin-only gate — must be used AFTER requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}

/**
 * Internal service gate — validates the x-internal-secret header.
 * Used to authenticate worker → api callbacks.
 */
function requireInternal(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== config.internalSecret) {
    logger.warn('Internal auth failed', { ip: req.ip, path: req.path });
    return next(ApiError.forbidden('Internal access only'));
  }
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractToken(req) {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // 2. HttpOnly cookie
  if (req.cookies && req.cookies.hub_token) {
    return req.cookies.hub_token;
  }
  return null;
}

module.exports = { requireAuth, optionalAuth, requireAdmin, requireInternal, extractToken };
