/**
 * HUB 2.0 — Upload Routes (Local Storage)
 *
 * POST /api/upload
 *   Accepts a multipart/form-data MP4 upload.
 *   Saves the file to local disk: STORAGE_PATH/uploads/{videoId}/original.{ext}
 *   Creates a Video document and enqueues a BullMQ transcoding job.
 *
 * GET /api/upload/:videoId/status
 *   Polls the transcoding progress for a video.
 */
'use strict';

const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs/promises');
const router  = express.Router();

const Video   = require('../db/models/Video');
const config  = require('../config');
const { requireAuth }           = require('../middleware/auth');
const { validate, schemas }     = require('../middleware/validate');
const { ApiError }              = require('../middleware/errorHandler');
const { enqueueTranscoding, getJobStatus } = require('../services/queueService');
const logger  = require('../logger');

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../../../storage');

logger.info(`Using STORAGE_PATH: ${STORAGE_PATH}`);

// ---------------------------------------------------------------------------
// Multer — local disk storage
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Generate UUID now so we can use it in the path
    const videoUuid = uuidv4();
    req.videoUuid = videoUuid; // Attach to req so route handler can use it
    
    const uploadDir = path.join(STORAGE_PATH, 'uploads', videoUuid);
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `original${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    // Accept only common video MIME types
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(415, `Unsupported media type: ${file.mimetype}`, 'UNSUPPORTED_MEDIA'));
    }
  },
});

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  upload.single('video'),
  // Pre-process: parse comma-separated tags string into array before Joi validation
  (req, res, next) => {
    if (req.body.tags && typeof req.body.tags === 'string') {
      req.body.tags = req.body.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }
    next();
  },
  validate(schemas.videoUpload),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw ApiError.badRequest('No video file provided. Field name must be "video".');
      }

      const { title, description, tags, visibility } = req.body;
      const { originalname, mimetype, size, path: localFilePath } = req.file;
      const ownerId = req.user.sub;
      const videoUuid = req.videoUuid; // Retrieved from multer

      logger.info('File saved to local storage', { localFilePath, size, ownerId });

      // -----------------------------------------------------------------------
      // Create Video document in MongoDB (status: 'queued')
      // -----------------------------------------------------------------------
      const video = await Video.create({
        title,
        description,
        tags,
        visibility,
        ownerId,
        status:         'queued',
        uploadObject:   localFilePath, // Repurpose field for local path
        fileSizeBytes:  size,
        originalName:   originalname,
        mimeType:       mimetype,
        hasEncryption:  true,
        keyObjectName:  `keys/${videoUuid}.key`, // Legacy field, keeping for consistency in keys route
      });

      // -----------------------------------------------------------------------
      // Enqueue transcoding job
      // -----------------------------------------------------------------------
      const job = await enqueueTranscoding({
        videoId:       video._id.toString(),
        videoUuid,
        localFilePath,
        ownerId,
      });

      // Update video with job ID
      await Video.findByIdAndUpdate(video._id, { jobId: job.id, status: 'queued' });

      logger.info('Video upload complete, job enqueued', {
        videoId: video._id,
        jobId:   job.id,
      });

      res.status(202).json({
        success:  true,
        message:  'Upload accepted. Transcoding in progress.',
        videoId:  video._id,
        jobId:    job.id,
        statusUrl: `/api/upload/${video._id}/status`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/upload/:videoId/status
// Polling endpoint — returns current transcoding status + progress
// ---------------------------------------------------------------------------
router.get('/:videoId/status', requireAuth, async (req, res, next) => {
  try {
    const video = await Video.findOne({
      _id:     req.params.videoId,
      ownerId: req.user.sub,
    }).select('status progress jobId transcodeError masterPlaylistKey');

    if (!video) throw ApiError.notFound('Video not found');

    // Also fetch live BullMQ state if still processing
    let queueState = null;
    if (['queued', 'transcoding'].includes(video.status)) {
      queueState = await getJobStatus(video._id.toString());
    }

    res.json({
      success: true,
      videoId: video._id,
      status:  video.status,
      progress: video.progress,
      queueState,
      masterPlaylistKey: video.masterPlaylistKey,
      ...(video.transcodeError && { error: video.transcodeError }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
