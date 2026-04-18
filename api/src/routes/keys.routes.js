/**
 * HUB 2.0 — AES Key Delivery Route (Local Storage)
 *
 * GET /api/keys/:videoId
 *
 * CRITICAL SECURITY:
 *   - Only authenticated users may fetch a key.
 *   - The user must own the video OR the video must be public/unlisted.
 *   - Returns the raw 16-byte AES key in binary (Content-Type: application/octet-stream).
 *   - The .m3u8 playlist embeds this URL; the player's HLS engine calls it
 *     transparently to decrypt each .ts segment.
 *   - Response headers prevent caching of the key.
 */
'use strict';

const express = require('express');
const fs      = require('fs/promises');
const path    = require('path');
const router  = express.Router();

const Video   = require('../db/models/Video');
const { requireAuth }          = require('../middleware/auth');
const { ApiError }             = require('../middleware/errorHandler');
const logger  = require('../logger');

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../../../storage');

// ---------------------------------------------------------------------------
// GET /api/keys/:videoId
// ---------------------------------------------------------------------------
router.get('/:videoId', requireAuth, async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const requestingUserId = req.user.sub;

    // -----------------------------------------------------------------------
    // 1. Find the video (only ready videos have valid keys)
    // -----------------------------------------------------------------------
    const video = await Video.findById(videoId).select(
      'status ownerId visibility hasEncryption keyObjectName'
    );

    if (!video) {
      logger.warn('Key request for unknown video', { videoId, userId: requestingUserId });
      throw ApiError.notFound('Video not found');
    }

    if (video.status !== 'ready') {
      throw ApiError.badRequest('Video is not yet available for playback', 'VIDEO_NOT_READY');
    }

    if (!video.hasEncryption) {
      throw ApiError.badRequest('Video is not encrypted', 'NOT_ENCRYPTED');
    }

    // -----------------------------------------------------------------------
    // 2. Access control
    //    - Owner always has access
    //    - Public / unlisted → any authenticated user
    //    - Private → owner only
    // -----------------------------------------------------------------------
    const isOwner = video.ownerId.toString() === requestingUserId;

    if (!isOwner && video.visibility === 'private') {
      logger.warn('Unauthorized key request', {
        videoId,
        requestingUser: requestingUserId,
        owner:          video.ownerId,
        visibility:     video.visibility,
      });
      throw ApiError.forbidden('You do not have access to this video');
    }

    // -----------------------------------------------------------------------
    // 3. Retrieve the raw 16-byte key from local disk
    // -----------------------------------------------------------------------
    // We derive the key name from the video document or UUID. The worker saves it as {minioId}.key
    // Because we used UUID or ID in `generateAndStoreKey`. The `keyObjectName` usually has `keys/UUID.key`.
    // Let's parse it out or just find it. We know `keyObjectName` looks like `keys/uuid.key`.
    
    // Extract simply the filename 
    const keyFileName = path.basename(video.keyObjectName); // e.g. uuid.key
    const keyPath = path.join(STORAGE_PATH, 'keys', keyFileName);
    
    let keyBuffer;
    try {
        keyBuffer = await fs.readFile(keyPath);
    } catch (fsErr) {
        logger.error('Failed to read key file from disk', { keyPath, error: fsErr.message });
        throw ApiError.internal('Encryption key unavailable');
    }

    if (!keyBuffer || keyBuffer.length !== 16) {
      logger.error('Retrieved malformed key', { videoId, length: keyBuffer?.length });
      throw ApiError.internal('Encryption key corrupted');
    }

    logger.info('AES key served', {
      videoId,
      userId:     requestingUserId,
      isOwner,
      visibility: video.visibility,
    });

    // -----------------------------------------------------------------------
    // 4. Return raw key bytes
    //    - Content-Type: application/octet-stream (binary)
    //    - Strict no-cache headers (key must never be stored client-side)
    // -----------------------------------------------------------------------
    res
      .status(200)
      .set({
        'Content-Type':  'application/octet-stream',
        'Content-Length': keyBuffer.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma':        'no-cache',
        'Expires':       '0',
        // Prevent browser from sniffing content
        'X-Content-Type-Options': 'nosniff',
      })
      .send(keyBuffer);

  } catch (err) {
    next(err);
  }
});

module.exports = router;
