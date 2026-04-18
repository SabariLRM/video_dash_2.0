/**
 * HUB 2.0 — Video Model
 *
 * Tracks the full lifecycle of a video:
 *   uploading → queued → transcoding → ready | failed
 */
'use strict';

const mongoose = require('mongoose');

// Sub-schema for each HLS rendition
const renditionSchema = new mongoose.Schema(
  {
    label:        { type: String, required: true },  // '1080p', '720p', '480p'
    resolution:   { type: String, required: true },
    bandwidth:    { type: Number, required: true },
    playlistKey:  { type: String, required: true },  // MinIO object key
  },
  { _id: false }
);

const videoSchema = new mongoose.Schema(
  {
    // Identity
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    tags:        [{ type: String, trim: true }],

    // Ownership
    ownerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // Lifecycle status
    status: {
      type:    String,
      enum:    ['uploading', 'queued', 'transcoding', 'ready', 'failed', 'deleted'],
      default: 'uploading',
      index:   true,
    },

    // Processing metadata
    jobId:          { type: String },       // BullMQ job ID
    transcodeError: { type: String },       // Error message if status === 'failed'
    progress:       { type: Number, default: 0, min: 0, max: 100 },

    // Source upload (raw MP4 in hub-uploads bucket)
    uploadObject:   { type: String },       // e.g. "uploads/{uuid}.mp4"
    fileSizeBytes:  { type: Number },
    originalName:   { type: String },
    mimeType:       { type: String },

    // HLS output (in hub-videos bucket)
    masterPlaylistKey: { type: String },    // e.g. "videos/{uuid}/master.m3u8"
    renditions:        [renditionSchema],

    // Encryption — key is stored in hub-keys bucket ONLY
    // We store only a reference, never the key itself in the DB
    hasEncryption:  { type: Boolean, default: true },
    keyObjectName:  { type: String },       // e.g. "keys/{uuid}.key"

    // Public metadata
    duration:       { type: Number },       // seconds
    thumbnailKey:   { type: String },       // MinIO key for thumbnail
    visibility:     { type: String, enum: ['public', 'private', 'unlisted'], default: 'private' },

    // Analytics
    viewCount:      { type: Number, default: 0 },
    likeCount:      { type: Number, default: 0 },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ---------- Indexes ----------
// Note: ownerId, status, visibility already have indexes from index:true.
videoSchema.index({ ownerId: 1, createdAt: -1 });
videoSchema.index({ title: 'text', description: 'text', tags: 'text' });
videoSchema.index({ visibility: 1, createdAt: -1 });

// ---------- Virtuals ----------
videoSchema.virtual('masterPlaylistUrl').get(function () {
  if (!this.masterPlaylistKey) return null;
  // Returns the Nginx-served URL; caller uses this as the HLS source
  return `/hls/${this.masterPlaylistKey}`;
});

module.exports = mongoose.model('Video', videoSchema);
