/**
 * HUB 2.0 — Internal Routes
 *
 * These endpoints are ONLY callable by other services within the Docker network.
 * They are guarded by the x-internal-secret header (see requireInternal middleware).
 * Nginx never exposes /internal/* to the public internet.
 *
 * POST /internal/jobs/complete   → Worker calls this when transcoding finishes
 */
'use strict';

const express = require('express');
const router  = express.Router();
const Joi     = require('joi');

const Video   = require('../db/models/Video');
const { requireInternal } = require('../middleware/auth');
const { ApiError }        = require('../middleware/errorHandler');
const logger  = require('../logger');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const completeSchema = Joi.object({
  videoId:           Joi.string().required(),
  status:            Joi.string().valid('ready', 'failed').required(),
  masterPlaylistKey: Joi.string().when('status', { is: 'ready', then: Joi.required() }),
  uploadedObjects:   Joi.array().items(Joi.string()).optional(),
  error:             Joi.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /internal/jobs/complete
// Called by the worker when a transcoding job finishes (success or failure).
// ---------------------------------------------------------------------------
router.post('/jobs/complete', requireInternal, async (req, res, next) => {
  try {
    const { error, value } = completeSchema.validate(req.body);
    if (error) throw ApiError.badRequest(error.message);

    const { videoId, status, masterPlaylistKey, uploadedObjects, error: transcodeError } = value;

    const update = {
      status,
      progress: status === 'ready' ? 100 : undefined,
      ...(masterPlaylistKey && { masterPlaylistKey }),
      ...(transcodeError    && { transcodeError }),
    };

    // Build rendition array from uploaded objects
    if (status === 'ready' && uploadedObjects) {
      const renditions = [];
      const renditionMap = {
        '1080p': { resolution: '1920x1080', bandwidth: 4200000 },
        '720p':  { resolution: '1280x720',  bandwidth: 2700000 },
        '480p':  { resolution: '854x480',   bandwidth: 1100000 },
      };

      for (const [label, meta] of Object.entries(renditionMap)) {
        const playlistKey = uploadedObjects.find(
          (o) => o.includes(`/${label}/prog_index.m3u8`)
        );
        if (playlistKey) {
          renditions.push({ label, ...meta, playlistKey });
        }
      }
      update.renditions = renditions;
    }

    const video = await Video.findByIdAndUpdate(
      videoId,
      { $set: update },
      { new: true }
    );

    if (!video) {
      logger.warn('Job complete callback for unknown videoId', { videoId });
      throw ApiError.notFound('Video document not found');
    }

    logger.info('Video transcoding status updated', { videoId, status });

    res.json({ success: true, videoId, status });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /internal/jobs/progress
// Worker sends periodic progress updates (optional — BullMQ also tracks this)
// ---------------------------------------------------------------------------
router.post('/jobs/progress', requireInternal, async (req, res, next) => {
  try {
    const { videoId, progress } = req.body;
    if (!videoId || typeof progress !== 'number') {
      throw ApiError.badRequest('videoId and progress required');
    }

    await Video.findByIdAndUpdate(videoId, {
      $set: { status: 'transcoding', progress: Math.min(99, Math.max(0, progress)) },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
