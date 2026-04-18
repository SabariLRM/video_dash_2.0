// MongoDB initialization script
// Creates the hub_db database, indexes, and initial collections

db = db.getSiblingDB('hub_db');

db.createCollection('users');
db.createCollection('videos');
db.createCollection('analytics');

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

// Videos indexes
db.videos.createIndex({ ownerId: 1 });
db.videos.createIndex({ status: 1 });
db.videos.createIndex({ createdAt: -1 });
db.videos.createIndex({ title: 'text', description: 'text' }); // full-text search

// Analytics indexes
db.analytics.createIndex({ videoId: 1 });
db.analytics.createIndex({ userId: 1 });
db.analytics.createIndex({ timestamp: -1 });
db.analytics.createIndex({ videoId: 1, timestamp: -1 });

print('HUB 2.0: MongoDB initialized with indexes.');
