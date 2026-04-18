/**
 * HUB 2.0 — User Model
 */
'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      minlength: 3,
      maxlength: 30,
      match:     /^[a-zA-Z0-9_]+$/,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false, // never returned in queries by default
    },
    role: {
      type:    String,
      enum:    ['user', 'creator', 'admin'],
      default: 'user',
    },
    // Profile
    displayName: { type: String, trim: true },
    bio:         { type: String, maxlength: 500 },
    avatarUrl:   { type: String },
    // Subscription
    subscribedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Flags
    isActive:  { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ---------- Indexes ----------
// Note: email and username already have indexes from unique:true on the field.
// Only add additional compound or non-unique indexes here.
userSchema.index({ createdAt: 1 });

// ---------- Virtuals ----------
userSchema.virtual('subscriberCount', {
  ref:          'User',
  localField:   '_id',
  foreignField: 'subscribedTo',
  count:        true,
});

// ---------- Hooks ----------
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ---------- Methods ----------
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
