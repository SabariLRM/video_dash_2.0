/**
 * HUB 2.0 API — Configuration
 * Centralised, validated environment config.
 * Throws at startup if required vars are missing — fail-fast.
 */
'use strict';

require('dotenv').config();

function required(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

function optional(name, defaultValue) {
  return process.env[name] || defaultValue;
}

const config = {
  env: optional('NODE_ENV', 'development'),
  port: parseInt(optional('API_PORT', '4000'), 10),

  // MongoDB
  mongoUri: optional(
    'MONGO_URI',
    'mongodb://hubuser:hubmongo123@mongo:27017/hub_db?authSource=admin'
  ),

  // Redis / BullMQ
  redis: {
    url: optional('REDIS_URL', 'redis://:redishub123@redis:6379'),
    password: optional('REDIS_PASSWORD', 'redishub123'),
  },

  // MinIO
  minio: {
    endpoint:  optional('MINIO_ENDPOINT', 'minio'),
    port:      parseInt(optional('MINIO_PORT', '9000'), 10),
    useSSL:    optional('MINIO_USE_SSL', 'false') === 'true',
    accessKey: optional('MINIO_ACCESS_KEY', 'hubadmin'),
    secretKey: optional('MINIO_SECRET_KEY', 'hubsecret123'),
    buckets: {
      videos:  optional('MINIO_BUCKET_VIDEOS',  'hub-videos'),
      keys:    optional('MINIO_BUCKET_KEYS',    'hub-keys'),
      uploads: optional('MINIO_BUCKET_UPLOADS', 'hub-uploads'),
    },
  },

  // JWT
  jwt: {
    secret:    optional('JWT_SECRET', 'CHANGE_ME_IN_PRODUCTION_256bit'),
    expiresIn: optional('JWT_EXPIRES_IN', '1h'),
  },

  // Signed URL HMAC secret (for HLS auth_request tokens)
  signedUrlSecret: optional('SIGNED_URL_SECRET', 'CHANGE_ME_SIGNED_URL_SECRET'),

  // Internal service authentication (worker → api)
  internalSecret: optional('INTERNAL_SECRET', 'hub-internal-secret'),

  // Key delivery base URL (used to build the AES key URI in .m3u8)
  keyDeliveryBaseUrl: optional('KEY_DELIVERY_BASE_URL', 'http://localhost:8080/api/keys'),

  // Upload limits
  maxUploadSizeMb: parseInt(optional('MAX_UPLOAD_SIZE_MB', '2048'), 10), // 2 GB
};

module.exports = config;
