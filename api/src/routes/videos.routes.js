/**
 * HUB 2.0 — Video Metadata Routes
 *
 * GET    /api/videos            → List public videos (paginated)
 * GET    /api/videos/my         → List caller's own videos (any status)
 * GET    /api/videos/:videoId   → Get a single video's metadata
 * PATCH  /api/videos/:videoId   → Update video metadata (owner only)
 * DELETE /api/videos/:videoId   → Soft-delete a video (owner only)
 */
'use strict';

const express = require('express');
const router  = express.Router();

const Video   = require('../db/models/Video');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validate, schemas }    = require('../middleware/validate');
const { ApiError }             = require('../middleware/errorHandler');
const logger  = require('../logger');

// ---------------------------------------------------------------------------
// GET /api/videos  — public feed (paginated)
// ---------------------------------------------------------------------------
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip  = (page - 1) * limit;
    const q     = req.query.q; // full-text search

    const filter = { status: 'ready', visibility: 'public' };
    if (q) filter.$text = { $search: q };

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'username displayName avatarUrl')
        .select('-masterPlaylistKey -keyObjectName -uploadObject'),
      Video.countDocuments(filter),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      pages:  Math.ceil(total / limit),
      videos,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/videos/my  — authenticated user's own videos
// ---------------------------------------------------------------------------
router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const skip  = (page - 1) * limit;

    const videos = await Video.find({ ownerId: req.user.sub, status: { $ne: 'deleted' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-keyObjectName -uploadObject');

    res.json({ success: true, videos });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/videos/:videoId  — single video
// ---------------------------------------------------------------------------
router.get('/:videoId', optionalAuth, async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId)
      .populate('ownerId', 'username displayName avatarUrl')
      .select('-keyObjectName -uploadObject');

    if (!video || video.status === 'deleted') {
      throw ApiError.notFound('Video not found');
    }

    // Enforce visibility
    const isOwner = req.user && req.user.sub === video.ownerId._id.toString();
    if (video.visibility === 'private' && !isOwner) {
      throw ApiError.forbidden('This video is private');
    }

    // Increment view count for ready public videos (async, non-blocking)
    if (video.status === 'ready' && video.visibility !== 'private') {
      Video.findByIdAndUpdate(videoId, { $inc: { viewCount: 1 } }).exec();
    }

    // For the owner, include the HLS URL for playback
    const responseVideo = video.toObject({ virtuals: true });

    res.json({ success: true, video: responseVideo });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/videos/:videoId  — update metadata (owner only)
// ---------------------------------------------------------------------------
router.patch('/:videoId', requireAuth, validate(schemas.videoUpdate), async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findOne({ _id: videoId, ownerId: req.user.sub });
    if (!video) throw ApiError.notFound('Video not found or access denied');

    const allowedFields = ['title', 'description', 'tags', 'visibility'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) video[field] = req.body[field];
    });

    await video.save();

    logger.info('Video metadata updated', { videoId, userId: req.user.sub });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/videos/:videoId  — soft delete (sets status to 'deleted')
// ---------------------------------------------------------------------------
router.delete('/:videoId', requireAuth, async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findOne({ _id: videoId, ownerId: req.user.sub });
    if (!video) throw ApiError.notFound('Video not found or access denied');

    video.status = 'deleted';
    await video.save();

    logger.info('Video soft-deleted', { videoId, userId: req.user.sub });
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
