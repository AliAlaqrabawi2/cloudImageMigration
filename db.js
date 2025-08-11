const { MongoClient } = require('mongodb');
const logger = require('./logger');
require('dotenv').config();

let mongoUri =  process.env.MONGO_URI;

const client = new MongoClient(mongoUri);
let db;

async function connect() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME);
    logger.info('✅ Connected to MongoDB');
    return db;
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err);
  }
}

function getDB() {
  if (!db) throw new Error("Database not connected yet.");
  return db;
}

module.exports = {
  connect,
  getDB
};
