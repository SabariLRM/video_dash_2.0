/**
 * HUB 2.0 — BullMQ Transcoding Worker (Local Storage)
 *
 * Consumes jobs from the 'transcoding' queue. Each job payload:
 * {
 *   videoId:       string,   // UUID
 *   localFilePath: string,   // Full local path where MP4 was uploaded
 *   ownerId:       string,   // User who owns this video
 * }
 *
 * Job lifecycle:
 *   1. Prepare output dir in STORAGE_PATH/hls/{minioId}
 *   2. Generate AES-128 key → store in STORAGE_PATH/keys/ + write FFmpeg keyinfo
 *   3. Run FFmpeg: MP4 → encrypted 3-rendition HLS writing directly to output dir
 *   4. Clean up the original local source upload
 *   5. Report completion (API will update the DB record)
 */
'use strict';

require('dotenv').config();

const path    = require('path');
const fs      = require('fs/promises');
const os      = require('os');
const { Worker, QueueEvents } = require('bullmq');
const axios   = require('axios');
const Joi     = require('joi');

const logger      = require('./logger');
const { generateAndStoreKey } = require('./keyManager');
const { transcodeToHLS }      = require('./transcoder');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const QUEUE_NAME   = 'transcoding';
const MAX_RETRIES  = 3;
const TRANSCODE_TMP = process.env.TRANSCODE_TMP || path.join(os.tmpdir(), 'hub_transcode');
const STORAGE_PATH  = process.env.STORAGE_PATH || path.join(__dirname, '../../../../storage');

const KEY_DELIVERY_BASE_URL = process.env.KEY_DELIVERY_BASE_URL || 'http://localhost:8080/api/keys';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://api:4000';

// ---------------------------------------------------------------------------
// Job payload validation schema
// ---------------------------------------------------------------------------
const jobSchema = Joi.object({
  videoId:       Joi.string().required(),
  videoUuid:     Joi.string().uuid().optional(),
  localFilePath: Joi.string().min(1).required(),
  ownerId:       Joi.string().min(1).required(),
}).unknown(false);

// ---------------------------------------------------------------------------
// Core job processor
// ---------------------------------------------------------------------------
async function processTranscodingJob(job) {
  const { error, value: payload } = jobSchema.validate(job.data);
  if (error) {
    throw new Error(`Invalid job payload: ${error.message}`);
  }

  const { videoId, videoUuid, localFilePath, ownerId } = payload;
  const minioId = videoUuid || videoId;
  const jobDir = path.join(TRANSCODE_TMP, minioId);

  logger.info('Transcoding job started', { jobId: job.id, videoId, ownerId });

  try {
    // -------------------------------------------------------------------------
    // Step 1: Prepare temp directories
    // -------------------------------------------------------------------------
    const keyDir    = path.join(jobDir, 'keys');
    await fs.mkdir(keyDir,    { recursive: true });

    // Output directory directly in local storage
    const outputDir = path.join(STORAGE_PATH, 'hls', minioId);
    await fs.mkdir(outputDir, { recursive: true });

    await job.updateProgress(5);
    await job.updateProgress(15); 

    // -------------------------------------------------------------------------
    // Step 2: Generate AES-128 encryption key
    // -------------------------------------------------------------------------
    const keyDeliveryUrl = `${KEY_DELIVERY_BASE_URL}/${videoId}`;

    const { keyInfoPath } = await generateAndStoreKey(minioId, keyDir, keyDeliveryUrl);
    logger.info('AES-128 key ready', { videoId, keyInfoPath });

    await job.updateProgress(20);

    // -------------------------------------------------------------------------
    // Step 3: Transcode with FFmpeg directly into output folder
    // -------------------------------------------------------------------------
    let lastLoggedPercent = 0;

    await transcodeToHLS({
      inputPath: localFilePath,
      outputDir,
      keyInfoPath,
      onProgress: ({ rendition, percent }) => {
        const jobPercent = Math.round(20 + (percent / 100) * 75); // scales 20 -> 95
        if (jobPercent - lastLoggedPercent >= 5) {
          lastLoggedPercent = jobPercent;
          job.updateProgress(jobPercent);
          logger.debug('Transcoding progress', { videoId, rendition, percent, jobPercent });
        }
      },
    });

    await job.updateProgress(95);

    // -------------------------------------------------------------------------
    // Step 4: No Minio Upload! Directly notify API of completion
    // -------------------------------------------------------------------------
    const masterPlaylistKey = `hls/${minioId}/master.m3u8`;
    try {
      await axios.post(
        `${INTERNAL_API_URL}/internal/jobs/complete`,
        {
          videoId,
          status: 'ready',
          masterPlaylistKey, // The URL path prefix where Nginx serves video
          uploadedObjects: [
            '/1080p/prog_index.m3u8',
            '/720p/prog_index.m3u8',
            '/480p/prog_index.m3u8'
          ],
        },
        {
          headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'hub-internal-secret' },
          timeout: 5000,
        }
      );
      logger.info('Notified API of completion', { videoId });
    } catch (notifyErr) {
      logger.warn('API notification failed (non-fatal)', { videoId, error: notifyErr.message });
    }

    await job.updateProgress(100);

    // Clean up original uploaded file
    try {
      const parentUploadsDir = path.dirname(localFilePath);
      await fs.rm(parentUploadsDir, { recursive: true, force: true });
    } catch(err) {
      logger.warn('Could not clean up original upload file', { error: err.message });
    }

    logger.info('Transcoding job complete', {
      jobId:    job.id,
      videoId,
      storagePath: outputDir
    });

    return { videoId, masterPlaylistKey };

  } finally {
    // -------------------------------------------------------------------------
    // Cleanup Temp Dir (keys directory)
    // -------------------------------------------------------------------------
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      logger.debug('Temp directory cleaned', { jobDir });
    } catch (cleanupErr) {
      logger.warn('Temp cleanup failed', { jobDir, error: cleanupErr.message });
    }
  }
}

// ---------------------------------------------------------------------------
// BullMQ Worker setup
// ---------------------------------------------------------------------------
async function startWorker() {
  await fs.mkdir(TRANSCODE_TMP, { recursive: true });

  const redisConnection = {
    host:     (process.env.REDIS_URL || '').replace(/^redis:\/\/:.*@/, '').split(':')[0] || 'localhost',
    port:     6379,
    password: process.env.REDIS_PASSWORD,
  };

  const redisUrl = process.env.REDIS_URL;
  let connection;
  if (redisUrl) {
    const url = new URL(redisUrl);
    connection = {
      host:     url.hostname,
      port:     parseInt(url.port || '6379', 10),
      password: url.password || undefined,
    };
  } else {
    connection = redisConnection;
  }

  const worker = new Worker(QUEUE_NAME, processTranscodingJob, {
    connection,
    concurrency: 1,
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
    settings: { backoffStrategy: (attemptsMade) => Math.pow(2, attemptsMade) * 30_000 },
  });

  worker.on('active', (job) => logger.info('Job active', { jobId: job.id, videoId: job.data.videoId }));
  worker.on('completed', (job, result) => logger.info('Job completed', { jobId: job.id, result }));
  worker.on('failed', (job, err) => logger.error('Job failed', { error: err.message }));
  worker.on('error', (err) => logger.error('Worker error', { error: err.message }));

  const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  queueEvents.on('waiting', ({ jobId }) => logger.debug('Job waiting in queue', { jobId }));

  logger.info('HUB 2.0 Transcoding Worker started', { queue: QUEUE_NAME, concurrency: 1, tmpDir: TRANSCODE_TMP, storage: STORAGE_PATH });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await worker.close();
    await queueEvents.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  logger.error('Worker failed to start', { error: err.message, stack: err.stack });
  process.exit(1);
});
