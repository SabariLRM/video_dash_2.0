/**
 * HUB 2.0 — FFmpeg HLS Transcoder
 *
 * Takes a source video file (downloaded from MinIO 'hub-uploads' bucket)
 * and produces an AES-128 encrypted Adaptive Bitrate HLS output with:
 *
 *   Renditions:
 *     1080p  — 4000k video,  192k audio
 *      720p  — 2500k video,  128k audio
 *      480p  — 1000k video,   96k audio
 *
 *   Output layout (in tmpDir):
 *     master.m3u8
 *     1080p/prog_index.m3u8   +  1080p/seg_*.ts
 *      720p/prog_index.m3u8   +   720p/seg_*.ts
 *      480p/prog_index.m3u8   +   480p/seg_*.ts
 *
 * AES-128 encryption is applied per-rendition using the shared key info file.
 * Each .ts segment is independently decryptable (standard HLS encryption).
 */
'use strict';

const ffmpeg  = require('fluent-ffmpeg');
const path    = require('path');
const fs      = require('fs/promises');
const logger  = require('./logger');

// ---------------------------------------------------------------------------
// Rendition definitions
// ---------------------------------------------------------------------------
const RENDITIONS = [
  {
    label:      '1080p',
    resolution: '1920x1080',
    videoBitrate:  '4000k',
    audioBitrate:  '192k',
    bandwidth:  4200000, // for master playlist BANDWIDTH attribute
  },
  {
    label:      '720p',
    resolution: '1280x720',
    videoBitrate:  '2500k',
    audioBitrate:  '128k',
    bandwidth:  2700000,
  },
  {
    label:      '480p',
    resolution: '854x480',
    videoBitrate:  '1000k',
    audioBitrate:  '96k',
    bandwidth:  1100000,
  },
];

// Segment duration in seconds (3–5s is optimal for ABR)
const SEGMENT_DURATION = 4;

// ---------------------------------------------------------------------------
// Internal: build and run FFmpeg for a single rendition
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {string} opts.inputPath    - Absolute path to the source video
 * @param {string} opts.outputDir    - Directory for this rendition's output
 * @param {object} opts.rendition    - Rendition config (label, resolution, bitrates)
 * @param {string} opts.keyInfoPath  - FFmpeg key info file path
 * @param {Function} opts.onProgress - Progress callback { percent }
 * @returns {Promise<void>}
 */
function transcodeRendition({ inputPath, outputDir, rendition, keyInfoPath, onProgress }) {
  return new Promise((resolve, reject) => {
    const playlistPath = path.join(outputDir, 'prog_index.m3u8');
    const segmentPattern = path.join(outputDir, 'seg_%05d.ts');

    const cmd = ffmpeg(inputPath)
      // ----- Video codec -----
      .videoCodec('libx264')
      .outputOptions([
        `-preset veryfast`,         // fast encode; use 'slow' for better compression in prod
        '-profile:v high',
        '-level 4.0',
        `-vf scale=${rendition.resolution}:force_original_aspect_ratio=decrease,pad=${rendition.resolution.replace('x', ':')}:(ow-iw)/2:(oh-ih)/2`,
        `-b:v ${rendition.videoBitrate}`,
        `-maxrate ${rendition.videoBitrate}`,
        `-bufsize ${parseInt(rendition.videoBitrate) * 2}k`,
        '-g 48',                    // GOP = 2x frame rate (24fps → GOP 48)
        '-sc_threshold 0',          // Disable scene-cut detection for consistent segments
        '-keyint_min 48',
      ])
      // ----- Audio codec -----
      .audioCodec('aac')
      .outputOptions([
        `-b:a ${rendition.audioBitrate}`,
        '-ar 48000',
        '-ac 2',
      ])
      // ----- HLS muxer settings -----
      .outputOptions([
        '-f hls',
        `-hls_time ${SEGMENT_DURATION}`,
        '-hls_playlist_type vod',
        '-hls_flags independent_segments+delete_segments',
        '-hls_segment_type mpegts',
        `-hls_segment_filename ${segmentPattern}`,
        // AES-128 encryption — FFmpeg reads key URI + path from keyinfo file
        `-hls_key_info_file ${keyInfoPath}`,
        '-hls_list_size 0',         // Include ALL segments in the playlist
      ])
      .output(playlistPath)
      .on('start', (cmdLine) => {
        logger.debug('FFmpeg started', { rendition: rendition.label, cmdLine });
      })
      .on('progress', (progress) => {
        if (onProgress && progress.percent != null) {
          onProgress({ percent: Math.round(progress.percent), rendition: rendition.label });
        }
      })
      .on('error', (err, stdout, stderr) => {
        logger.error('FFmpeg error', { rendition: rendition.label, error: err.message, stderr });
        reject(new Error(`FFmpeg failed for ${rendition.label}: ${err.message}`));
      })
      .on('end', () => {
        logger.info('FFmpeg rendition complete', { rendition: rendition.label });
        resolve();
      });

    cmd.run();
  });
}

// ---------------------------------------------------------------------------
// Internal: generate the HLS master playlist
// ---------------------------------------------------------------------------
/**
 * Writes master.m3u8 that references all rendition sub-playlists.
 *
 * @param {string} outputDir  - Root output directory (containing rendition subdirs)
 * @param {object[]} renditions
 * @returns {Promise<string>}  - Absolute path to master.m3u8
 */
async function writeMasterPlaylist(outputDir, renditions) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', ''];

  for (const r of renditions) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.resolution},CODECS="avc1.640028,mp4a.40.2",NAME="${r.label}"`,
      `${r.label}/prog_index.m3u8`
    );
    lines.push('');
  }

  const masterPath = path.join(outputDir, 'master.m3u8');
  await fs.writeFile(masterPath, lines.join('\n'), 'utf8');
  logger.info('Master playlist written', { masterPath });
  return masterPath;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Transcode an MP4 into AES-128 encrypted adaptive HLS.
 *
 * @param {object} opts
 * @param {string} opts.inputPath    - Local path to the source MP4
 * @param {string} opts.outputDir    - Root dir to write HLS output
 * @param {string} opts.keyInfoPath  - FFmpeg key info file path
 * @param {Function} [opts.onProgress] - Called with { rendition, percent }
 * @returns {Promise<{ masterPlaylistPath: string, renditions: object[] }>}
 */
async function transcodeToHLS({ inputPath, outputDir, keyInfoPath, onProgress }) {
  logger.info('Starting HLS transcoding', { inputPath, outputDir, renditions: RENDITIONS.map(r => r.label) });

  // Transcode all renditions sequentially.
  // In a high-throughput production system you would run these in parallel
  // across multiple worker containers; sequentially keeps resource usage
  // predictable on a single machine.
  for (const rendition of RENDITIONS) {
    const renditionDir = path.join(outputDir, rendition.label);
    await fs.mkdir(renditionDir, { recursive: true });

    await transcodeRendition({
      inputPath,
      outputDir: renditionDir,
      rendition,
      keyInfoPath,
      onProgress,
    });
  }

  // Build master playlist
  const masterPlaylistPath = await writeMasterPlaylist(outputDir, RENDITIONS);

  logger.info('HLS transcoding pipeline complete', { masterPlaylistPath });
  return { masterPlaylistPath, renditions: RENDITIONS };
}

module.exports = { transcodeToHLS, RENDITIONS, SEGMENT_DURATION };
