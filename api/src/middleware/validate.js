/**
 * HUB 2.0 — Joi Request Validation Middleware
 *
 * Usage:
 *   router.post('/upload', validate(schemas.upload), handler)
 *
 * Validates req.body, req.params, or req.query against a Joi schema.
 * Returns 400 with a structured error on failure.
 */
'use strict';

const Joi = require('joi');
const { ApiError } = require('./errorHandler');

/**
 * @param {Joi.ObjectSchema} schema   - Joi schema to validate against
 * @param {'body'|'params'|'query'} [target='body']
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly:   false,   // collect ALL errors, not just the first
      stripUnknown: true,    // remove unknown fields
    });

    if (error) {
      const messages = error.details.map((d) => d.message).join('; ');
      return next(ApiError.badRequest(messages, 'VALIDATION_ERROR'));
    }

    req[target] = value; // replace with stripped, coerced value
    next();
  };
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------
const schemas = {
  register: Joi.object({
    username:    Joi.string().alphanum().min(3).max(30).required(),
    email:       Joi.string().email().required(),
    password:    Joi.string().min(8).max(128).required(),
    displayName: Joi.string().max(60).optional(),
  }),

  login: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  videoUpload: Joi.object({
    title:       Joi.string().min(1).max(200).required(),
    description: Joi.string().max(5000).optional().allow(''),
    tags:        Joi.array().items(Joi.string().max(50)).max(20).optional(),
    visibility:  Joi.string().valid('public', 'private', 'unlisted').default('private'),
  }),

  videoUpdate: Joi.object({
    title:       Joi.string().min(1).max(200).optional(),
    description: Joi.string().max(5000).optional().allow(''),
    tags:        Joi.array().items(Joi.string().max(50)).max(20).optional(),
    visibility:  Joi.string().valid('public', 'private', 'unlisted').optional(),
  }),

  videoId: Joi.object({
    videoId: Joi.string().regex(/^[a-f\d]{24}$/).required().messages({
      'string.pattern.base': 'videoId must be a valid MongoDB ObjectId',
    }),
  }),
};

module.exports = { validate, schemas };
