/**
 * HUB 2.0 — AES-128 Key Manager (Local Storage)
 *
 * Generates a cryptographically secure 128-bit AES key per video,
 * writes the key info file FFmpeg expects, and stores the raw key
 * in the local filesystem at STORAGE_PATH/keys.
 *
 * Key delivery to the player happens via the Express API only.
 *
 * FFmpeg requires a "key info file" with three lines:
 *   Line 1: URI the player will request to fetch the key
 *   Line 2: Local path to the raw 16-byte key file
 *   Line 3: (optional) IV in hex
 */
'use strict';

const crypto  = require('crypto');
const fs      = require('fs/promises');
const path    = require('path');
const logger  = require('./logger');

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../../../storage');

/**
 * Generates an AES-128 key for a video, stores it locally,
 * and writes the FFmpeg key info file to disk.
 *
 * @param {string} videoId       - Unique video identifier (UUID)
 * @param {string} tmpDir        - Temp directory for this transcoding job
 * @param {string} keyDeliveryUrl - Public URL the player hits to get the key
 *                                  e.g. "http://localhost:8080/api/keys/{videoId}"
 * @returns {Promise<{ keyInfoPath: string, keyPath: string, ivHex: string }>}
 */
async function generateAndStoreKey(videoId, tmpDir, keyDeliveryUrl) {
  // 128-bit AES key (16 bytes)
  const keyBytes = crypto.randomBytes(16);
  // Random 128-bit IV
  const ivBytes  = crypto.randomBytes(16);
  const ivHex    = ivBytes.toString('hex');

  // Ensure keys dir exists in storage
  const keysStorageDir = path.join(STORAGE_PATH, 'keys');
  await fs.mkdir(keysStorageDir, { recursive: true });

  // Paths for final storage
  const finalKeyPath = path.join(keysStorageDir, `${videoId}.key`);
  const finalIvPath  = path.join(keysStorageDir, `${videoId}.iv`);

  // Path inside the temp directory for FFmpeg
  const keyInfoPath = path.join(tmpDir, `${videoId}.keyinfo`);

  // Write raw key bytes to local storage
  await fs.writeFile(finalKeyPath, keyBytes);
  // Write IV to local storage
  await fs.writeFile(finalIvPath, ivHex, 'utf8');

  // Write key info file for FFmpeg
  // Line 1: URI the player will use to fetch the decryption key
  // Line 2: Local filesystem path to the raw key (for FFmpeg to read)
  // Line 3: IV in hex (FFmpeg will embed this in the .m3u8)
  const keyInfo = [keyDeliveryUrl, finalKeyPath, ivHex].join('\n');
  await fs.writeFile(keyInfoPath, keyInfo, 'utf8');

  logger.info('AES-128 key generated and stored locally', { videoId, finalKeyPath });

  return { keyInfoPath, keyPath: finalKeyPath, ivHex };
}

module.exports = { generateAndStoreKey };
