/**
 * HUB 2.0 — Auth Routes
 *
 * POST /api/auth/register      → Create new user account
 * POST /api/auth/login         → Issue JWT (cookie + JSON)
 * POST /api/auth/logout        → Clear session cookie
 * GET  /api/auth/me            → Get current user profile
 * GET  /api/auth/validate-hls  → Internal endpoint for Nginx auth_request
 */
'use strict';

const express   = require('express');
const jwt       = require('jsonwebtoken');
const router    = express.Router();

const User      = require('../db/models/User');
const config    = require('../config');
const { requireAuth, extractToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { ApiError } = require('../middleware/errorHandler');
const logger    = require('../logger');

// ---------------------------------------------------------------------------
// Helper: sign a JWT and set the HttpOnly cookie
// ---------------------------------------------------------------------------
function issueToken(res, user) {
  const payload = {
    sub:      user._id.toString(),
    username: user.username,
    role:     user.role,
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  // Set HttpOnly cookie for browser clients
  res.cookie('hub_token', token, {
    httpOnly: true,
    secure:   config.env === 'production',
    sameSite: 'strict',
    maxAge:   3600 * 1000, // 1 hour in ms
  });

  return token;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post('/register', validate(schemas.register), async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.body;

    const user = new User({
      username,
      email,
      passwordHash: password, // pre-save hook hashes it
      displayName:  displayName || username,
    });

    await user.save();

    const token = issueToken(res, user);

    logger.info('User registered', { userId: user._id, username });

    res.status(201).json({
      success: true,
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Explicitly select passwordHash (it is `select: false` in schema)
    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    user.lastLogin = new Date();
    await user.save();

    const token = issueToken(res, user);

    logger.info('User logged in', { userId: user._id });

    res.json({
      success: true,
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  res.clearCookie('hub_token');
  res.json({ success: true, message: 'Logged out' });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) throw ApiError.notFound('User not found');
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/validate-hls
//
// Called by Nginx auth_request for every /hls/* request.
// Returns 200 if the session is valid, 401/403 otherwise.
// Nginx will only proxy to MinIO on a 200 response.
//
// This endpoint intentionally returns minimal body — Nginx only checks status.
// ---------------------------------------------------------------------------
router.get('/validate-hls', (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ valid: false });
    }

    jwt.verify(token, config.jwt.secret);

    // Token is valid — Nginx proceeds to proxy the HLS file
    return res.status(200).json({ valid: true });
  } catch (err) {
    logger.debug('HLS validation failed', { error: err.message, ip: req.ip });
    return res.status(401).json({ valid: false, reason: err.message });
  }
});

module.exports = router;
