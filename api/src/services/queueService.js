/**
 * HUB 2.0 — BullMQ Queue Producer
 * Enqueues transcoding jobs from the API service.
 * The worker (separate container) consumes from this queue.
 */
'use strict';

const { Queue } = require('bullmq');
const config    = require('../config');
const logger    = require('../logger');

const QUEUE_NAME = 'transcoding';

// Parse REDIS_URL → host/port/password
const redisUrl = new URL(config.redis.url);
const connection = {
  host:     redisUrl.hostname,
  port:     parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password || undefined,
};

const transcodingQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential',
      delay: 30_000, // 30s base
    },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
  },
});

/**
 * Enqueue a transcoding job.
 *
 * @param {object} payload
 * @param {string} payload.videoId        - MongoDB Video document _id (as string)
 * @param {string} payload.uploadObject   - MinIO object key for the uploaded MP4
 * @param {string} payload.ownerId        - User ID who triggered the upload
 * @returns {Promise<import('bullmq').Job>} - The enqueued BullMQ job
 */
async function enqueueTranscoding(payload) {
  const { videoId } = payload;

  const job = await transcodingQueue.add(
    `transcode:${videoId}`,
    payload,
    {
      jobId: `transcode-${videoId}`, // Idempotent — prevents duplicate jobs
    }
  );

  logger.info('Transcoding job enqueued', {
    jobId:        job.id,
    videoId,
    payloadKeys:  Object.keys(payload),
  });

  return job;
}

/**
 * Get the status of a specific job.
 * Used by the status polling endpoint.
 */
async function getJobStatus(videoId) {
  const job = await transcodingQueue.getJob(`transcode-${videoId}`);
  if (!job) return null;

  const state    = await job.getState();
  const progress = job.progress;

  return { jobId: job.id, state, progress };
}

module.exports = { transcodingQueue, enqueueTranscoding, getJobStatus };
