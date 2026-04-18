/**
 * HUB 2.0 API — MongoDB Connection
 * Singleton Mongoose connection with retry logic.
 */
'use strict';

const mongoose = require('mongoose');
const config   = require('../config');
const logger   = require('../logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected', { uri: config.mongoUri.replace(/\/\/.*@/, '//***@') });
    isConnected = true;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — will attempt reconnect');
    isConnected = false;
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error', { error: err.message });
  });

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS:          45_000,
    maxPoolSize:              10,
  });
}

module.exports = { connectDB };
