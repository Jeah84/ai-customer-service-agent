// AI Customer Service Agent
// Complete support system with AI + human handoff
// Multi-channel: chat, email, SMS - Built for Railway

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const Redis = require('ioredis');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Initialize services
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const mailer = process.env.SMTP_HOST ? nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}) : null;

const twilioClient = process.env.TWILIO_ACCOUNT_SID ? 
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Database initialization
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(50),
      name VARCHAR(255),
      company VARCHAR(255),
      language VARCHAR(10) DEFAULT 'en',
      timezone VARCHAR(50) DEFAULT 'UTC',
      metadata JSONB,
      tags TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_contact TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      channel VARCHAR(50) NOT NULL,
      subject VARCHAR(500),
      status VARCHAR(50) DEFAULT 'open',
      priority VARCHAR(50) DEFAULT 'medium',
      sentiment VARCHAR(50),
      assigned_to VARCHAR(255),
      ai_handled BOOLEAN DEFAULT true,
      escalated BOOLEAN DEFAULT false,
      escalation_reason TEXT,
      satisfaction_rating INTEGER,
      tags TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender_type VARCHAR(50) NOT NULL,
      sender_name VARCHAR(255),
      sender_id VARCHAR(255),
      content TEXT NOT NULL,
      ai_generated BOOLEAN DEFAULT false,
      ai_confidence FLOAT,
      intent VARCHAR(100),
      entities JSONB,
      language VARCHAR(10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      content TEXT NOT NULL,
      category VARCHAR(100),
      tags TEXT[],
      language VARCHAR(10) DEFAULT 'en',
      useful_count INTEGER DEFAULT 0,
      not_useful_count INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
  console.log('✅ Database initialized');
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      ai: !!process.env.ANTHROPIC_API_KEY
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDatabase();
    
    httpServer.listen(PORT, () => {
      console.log(`🤖 AI Customer Service Agent running on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
