/**
 * HUB 2.0 — Express Application Entry Point
 *
 * Security stack applied in order:
 *   1. Helmet        — standard HTTP security headers
 *   2. CORS          — controlled cross-origin access
 *   3. Rate limiting — per-IP throttling
 *   4. Cookie parser — reads HttpOnly JWT cookies
 *   5. JSON body     — parsed with size limit
 *   6. Request logger
 *   7. Routes
 *   8. Error handler (always last)
 */
'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const config     = require('./config');
const logger     = require('./logger');
const { connectDB } = require('./db/connection');
const { errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes     = require('./routes/auth.routes');
const uploadRoutes   = require('./routes/upload.routes');
const videosRoutes   = require('./routes/videos.routes');
const keysRoutes     = require('./routes/keys.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

// ===========================================================================
// Security Middleware
// ===========================================================================

// Helmet — sets secure HTTP headers (CSP, X-Frame-Options, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // HLS players need access to MinIO/Nginx origin for segments
        connectSrc: ["'self'", 'http://localhost:8080', 'http://localhost:9000'],
        mediaSrc:   ["'self'", 'http://localhost:8080', 'blob:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS — allow React frontend (Phase 3) and React Native Metro
const allowedOrigins = [
  'http://localhost:3000',  // React web
  'http://localhost:8081',  // Expo Metro
  'http://localhost:8080',  // Nginx proxy (for internal calls)
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow no-origin requests (server-to-server, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true, // Required for HttpOnly cookie
    methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-secret'],
  })
);

// General API rate limiter — 200 req/15min per IP
const generalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, code: 'RATE_LIMITED', message: 'Too many requests' },
});

// Strict limiter for auth endpoints — 20 req/15min per IP
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             config.env === 'development' ? 500 : 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, code: 'RATE_LIMITED', message: 'Too many auth attempts' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ===========================================================================
// Body Parsing
// ===========================================================================
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================================================
// Request Logger (dev only to avoid noise in prod)
// ===========================================================================
if (config.env === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.debug(`${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        ms:     Date.now() - start,
        ip:     req.ip,
      });
    });
    next();
  });
}

// ===========================================================================
// Health Check (unauthenticated — used by Docker healthcheck + load balancers)
// ===========================================================================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'hub-api',
    version: process.env.npm_package_version || '1.0.0',
    uptime:  process.uptime(),
    time:    new Date().toISOString(),
  });
});

// ===========================================================================
// API Routes
// ===========================================================================
app.use('/api/auth',     authRoutes);
app.use('/api/upload',   uploadRoutes);
app.use('/api/videos',   videosRoutes);
app.use('/api/keys',     keysRoutes);

// Internal routes — only reachable within the Docker network
// (Nginx conf.d/hub.conf must NOT proxy /internal/* to the public)
app.use('/internal',     internalRoutes);

// 404 handler — must come AFTER all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    code:    'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ===========================================================================
// Global Error Handler (must be LAST)
// ===========================================================================
app.use(errorHandler);

// ===========================================================================
// Start Server
// ===========================================================================
async function start() {
  try {
    await connectDB();

    app.listen(config.port, '0.0.0.0', () => {
      logger.info(`HUB 2.0 API listening`, {
        port:  config.port,
        env:   config.env,
        mongo: config.mongoUri.replace(/\/\/.*@/, '//***@'),
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();

module.exports = app; // exported for testing
