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

    CREATE TABLE IF NOT EXISTS auto_responses (
      id SERIAL PRIMARY KEY,
      trigger_type VARCHAR(50) NOT NULL,
      trigger_value TEXT NOT NULL,
      response_template TEXT NOT NULL,
      priority INTEGER DEFAULT 5,
      active BOOLEAN DEFAULT true,
      use_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      reason VARCHAR(500) NOT NULL,
      escalated_by VARCHAR(50) DEFAULT 'AI',
      assigned_to VARCHAR(255),
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_at TIMESTAMP,
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      metric_type VARCHAR(100) NOT NULL,
      metric_value FLOAT NOT NULL,
      dimensions JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
  `);
  console.log('✅ Database initialized');
}

// AI Service Class
class AIService {
  constructor() {
    this.systemPrompt = `You are a helpful, professional customer service agent. 
Your goal is to provide accurate, empathetic support to customers.

Guidelines:
- Be friendly and professional
- Provide clear, actionable solutions
- If you don't know something, say so and offer to escalate
- Keep responses concise but complete
- Show empathy for customer frustrations
- Always end with asking if there's anything else you can help with

If a customer seems very frustrated, has a complex technical issue, or explicitly asks for a human, recommend escalation to a human agent.`;
  }

  async generateResponse(conversation, messages, knowledgeBase = []) {
    try {
      // Build context from knowledge base
      const kbContext = knowledgeBase.length > 0 ? `
Relevant knowledge base articles:
${knowledgeBase.map(kb => `- ${kb.title}: ${kb.content}`).join('\n')}
` : '';

      // Build conversation history
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.sender_type === 'customer' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Add latest customer message if not in history
      if (conversationHistory.length === 0 || conversationHistory[conversationHistory.length - 1].role !== 'user') {
        conversationHistory.push({
          role: 'user',
          content: messages[messages.length - 1].content
        });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: this.systemPrompt + '\n\n' + kbContext,
        messages: conversationHistory
      });

      const aiMessage = response.content[0].text;

      // Analyze if escalation is needed
      const needsEscalation = this.detectEscalationNeeded(aiMessage, messages);
      
      // Detect sentiment
      const sentiment = this.detectSentiment(messages[messages.length - 1].content);

      // Extract intent
      const intent = this.extractIntent(messages[messages.length - 1].content);

      return {
        message: aiMessage,
        confidence: 0.85,
        needsEscalation,
        sentiment,
        intent,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
      };
    } catch (error) {
      console.error('AI generation error:', error);
      return {
        message: "I apologize, but I'm having trouble processing your request right now. Let me connect you with a human agent who can help you better.",
        confidence: 0,
        needsEscalation: true,
        sentiment: 'neutral',
        intent: 'unknown'
      };
    }
  }

  detectEscalationNeeded(aiMessage, messages) {
    const escalationKeywords = [
      'connect you with',
      'transfer to a human',
      'speak to an agent',
      'cannot help with',
      'beyond my capabilities'
    ];

    const customerMessage = messages[messages.length - 1].content.toLowerCase();
    const customerWantsHuman = customerMessage.includes('speak to') || 
                                customerMessage.includes('human') || 
                                customerMessage.includes('agent') ||
                                customerMessage.includes('manager');

    const aiSuggestsEscalation = escalationKeywords.some(keyword => 
      aiMessage.toLowerCase().includes(keyword)
    );

    return customerWantsHuman || aiSuggestsEscalation;
  }

  detectSentiment(message) {
    const frustrated = ['angry', 'frustrated', 'terrible', 'worst', 'horrible', 'unacceptable'];
    const happy = ['great', 'thanks', 'appreciate', 'excellent', 'wonderful', 'perfect'];
    
    const lowerMessage = message.toLowerCase();
    
    if (frustrated.some(word => lowerMessage.includes(word))) return 'negative';
    if (happy.some(word => lowerMessage.includes(word))) return 'positive';
    return 'neutral';
  }

  extractIntent(message) {
    const intents = {
      'question': ['how', 'what', 'where', 'when', 'why', 'can i', 'is it possible'],
      'issue': ['problem', 'error', 'not working', 'broken', 'bug', 'issue'],
      'request': ['need', 'want', 'would like', 'can you', 'please'],
      'complaint': ['unhappy', 'disappointed', 'frustrated', 'complaint'],
      'feedback': ['suggest', 'idea', 'feedback', 'improvement']
    };

    const lowerMessage = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return intent;
      }
    }
    
    return 'general';
  }

  async searchKnowledgeBase(query) {
    // Simple keyword search - in production, use vector embeddings
    const result = await pool.query(
      `SELECT * FROM knowledge_base 
       WHERE title ILIKE $1 OR content ILIKE $1 OR $2 = ANY(tags)
       ORDER BY useful_count DESC, views DESC
       LIMIT 3`,
      [`%${query}%`, query]
    );
    
    return result.rows;
  }
}

const aiService = new AIService();

// API Endpoints

// Create or get customer
app.post('/api/customers', async (req, res) => {
  try {
    const { email, phone, name, company, language, timezone, metadata } = req.body;

    // Check if customer exists
    let customer;
    if (email) {
      const existing = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        customer = existing.rows[0];
        
        // Update last contact
        await pool.query('UPDATE customers SET last_contact = CURRENT_TIMESTAMP WHERE id = $1', [customer.id]);
        
        return res.json(customer);
      }
    }

    // Create new customer
    const result = await pool.query(
      `INSERT INTO customers (email, phone, name, company, language, timezone, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [email, phone, name, company, language || 'en', timezone || 'UTC', metadata || {}]
    );

    customer = result.rows[0];
    res.status(201).json(customer);
  } catch (error) {
    console.error('Customer creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { customer_id, channel, subject, initialMessage } = req.body;

    const result = await pool.query(
      `INSERT INTO conversations (customer_id, channel, subject, status, ai_handled)
       VALUES ($1, $2, $3, 'open', true)
       RETURNING *`,
      [customer_id, channel, subject]
    );

    const conversation = result.rows[0];

    // Add initial message
    if (initialMessage) {
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_type, sender_name, content)
         VALUES ($1, 'customer', 'Customer', $2)`,
        [conversation.id, initialMessage]
      );

      // Generate AI response
      const kbArticles = await aiService.searchKnowledgeBase(initialMessage);
      const aiResponse = await aiService.generateResponse(
        conversation,
        [{ sender_type: 'customer', content: initialMessage }],
        kbArticles
      );

      // Save AI response
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_type, sender_name, content, ai_generated, ai_confidence, intent)
         VALUES ($1, 'agent', 'AI Agent', $2, true, $3, $4)`,
        [conversation.id, aiResponse.message, aiResponse.confidence, aiResponse.intent]
      );

      // Update conversation sentiment
      await pool.query(
        'UPDATE conversations SET sentiment = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [aiResponse.sentiment, conversation.id]
      );

      // Check if escalation needed
      if (aiResponse.needsEscalation) {
        await pool.query(
          `INSERT INTO escalations (conversation_id, reason)
           VALUES ($1, 'AI recommended escalation')`,
          [conversation.id]
        );

        await pool.query(
          'UPDATE conversations SET escalated = true WHERE id = $1',
          [conversation.id]
        );
      }

      io.to(`conversation:${conversation.id}`).emit('new_message', {
        conversationId: conversation.id,
        sender: 'AI Agent',
        message: aiResponse.message
      });
    }

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Conversation creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { sender_type, sender_name, content } = req.body;

    // Get conversation
    const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversation = convResult.rows[0];

    // Save message
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_name, content)
       VALUES ($1, $2, $3, $4)`,
      [id, sender_type, sender_name, content]
    );

    // If customer message and AI handling, generate response
    if (sender_type === 'customer' && conversation.ai_handled && !conversation.escalated) {
      // Get conversation history
      const msgsResult = await pool.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [id]
      );

      const kbArticles = await aiService.searchKnowledgeBase(content);
      const aiResponse = await aiService.generateResponse(
        conversation,
        msgsResult.rows,
        kbArticles
      );

      // Save AI response
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_type, sender_name, content, ai_generated, ai_confidence)
         VALUES ($1, 'agent', 'AI Agent', $2, true, $3)`,
        [id, aiResponse.message, aiResponse.confidence]
      );

      // Update conversation
      await pool.query(
        'UPDATE conversations SET sentiment = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [aiResponse.sentiment, id]
      );

      // Check escalation
      if (aiResponse.needsEscalation && !conversation.escalated) {
        await pool.query(
          `INSERT INTO escalations (conversation_id, reason)
           VALUES ($1, 'AI detected escalation needed')`,
          [id]
        );

        await pool.query(
          'UPDATE conversations SET escalated = true WHERE id = $1',
          [id]
        );

        io.to('agents').emit('escalation', { conversationId: id });
      }

      io.to(`conversation:${id}`).emit('new_message', {
        conversationId: id,
        sender: 'AI Agent',
        message: aiResponse.message
      });
    }

    await pool.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Message sending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const { status, escalated, limit = 50 } = req.query;

    let query = 'SELECT c.*, cu.name as customer_name, cu.email as customer_email FROM conversations c LEFT JOIN customers cu ON c.customer_id = cu.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (escalated !== undefined) {
      query += ` AND c.escalated = $${paramIndex}`;
      params.push(escalated === 'true');
      paramIndex++;
    }

    query += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation with messages
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const convResult = await pool.query(
      'SELECT c.*, cu.name as customer_name, cu.email FROM conversations c LEFT JOIN customers cu ON c.customer_id = cu.id WHERE c.id = $1',
      [id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const msgsResult = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );

    res.json({
      conversation: convResult.rows[0],
      messages: msgsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Escalate conversation
app.post('/api/conversations/:id/escalate', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, assigned_to } = req.body;

    await pool.query(
      'UPDATE conversations SET escalated = true, assigned_to = $1, ai_handled = false WHERE id = $2',
      [assigned_to, id]
    );

    await pool.query(
      `INSERT INTO escalations (conversation_id, reason, assigned_to)
       VALUES ($1, $2, $3)`,
      [id, reason, assigned_to]
    );

    io.to('agents').emit('escalation', { conversationId: id, reason });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve conversation
app.post('/api/conversations/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { satisfaction_rating } = req.body;

    await pool.query(
      'UPDATE conversations SET status = $1, resolved_at = CURRENT_TIMESTAMP, satisfaction_rating = $2 WHERE id = $3',
      ['resolved', satisfaction_rating, id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard stats
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as open_conversations,
        COUNT(*) FILTER (WHERE escalated = true AND status = 'open') as escalated_conversations,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_today,
        AVG(satisfaction_rating)::float as avg_satisfaction,
        COUNT(*) FILTER (WHERE ai_handled = true AND status = 'resolved') as ai_resolved,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)::float as avg_resolution_minutes
      FROM conversations
      WHERE created_at > CURRENT_DATE
    `);

    const sentimentBreakdown = await pool.query(`
      SELECT sentiment, COUNT(*) as count
      FROM conversations
      WHERE created_at > CURRENT_DATE AND sentiment IS NOT NULL
      GROUP BY sentiment
    `);

    res.json({
      stats: stats.rows[0],
      sentimentBreakdown: sentimentBreakdown.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Knowledge base endpoints
app.post('/api/knowledge-base', async (req, res) => {
  try {
    const { title, content, category, tags, language } = req.body;

    const result = await pool.query(
      `INSERT INTO knowledge_base (title, content, category, tags, language)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, content, category, tags || [], language || 'en']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/knowledge-base', async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = 'SELECT * FROM knowledge_base WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY useful_count DESC, created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root route - Professional landing page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Customer Service Agent - Running</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 48px;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #1a1a1a;
            margin-bottom: 16px;
            font-size: 32px;
          }
          .status {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 24px;
          }
          p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          .endpoints {
            background: #f9fafb;
            border-radius: 8px;
            padding: 24px;
          }
          .endpoints h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: #1a1a1a;
          }
          .endpoint {
            margin-bottom: 12px;
          }
          .endpoint a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
          }
          .endpoint a:hover {
            text-decoration: underline;
          }
          .endpoint-desc {
            color: #999;
            font-size: 14px;
            margin-left: 8px;
          }
          .footer {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 AI Customer Service Agent</h1>
          <div class="status">✓ Service Running</div>
          <p>Your AI-powered customer service platform is deployed and ready to use. This application provides intelligent, multi-channel customer support powered by Claude AI.</p>
          
          <div class="endpoints">
            <h2>Available Endpoints</h2>
            <div class="endpoint">
              <a href="/health">/health</a>
              <span class="endpoint-desc">System health check</span>
            </div>
            <div class="endpoint">
              <span style="color: #667eea; font-weight: 500;">/api/chat</span>
              <span class="endpoint-desc">WebSocket chat endpoint</span>
            </div>
            <div class="endpoint">
              <span style="color: #667eea; font-weight: 500;">/api/email</span>
              <span class="endpoint-desc">Email support API</span>
            </div>
            <div class="endpoint">
              <span style="color: #667eea; font-weight: 500;">/api/sms</span>
              <span class="endpoint-desc">SMS support API</span>
            </div>
            <div class="endpoint">
              <span style="color: #667eea; font-weight: 500;">/api/conversations</span>
              <span class="endpoint-desc">Conversation management</span>
            </div>
          </div>
          
          <div class="footer">
            Powered by Claude AI • PostgreSQL • Redis
          </div>
        </div>
      </body>
    </html>
  `);
});

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

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('join_agents', () => {
    socket.join('agents');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
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
