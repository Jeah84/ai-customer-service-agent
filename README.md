# 🤖 AI Customer Service Agent

**Complete AI-powered customer support platform with multi-channel support, intelligent escalation, and real-time analytics**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/ai-customer-service)

---

## ✨ Features

### 🎯 Core Capabilities
- ✅ **AI-First Response** - Claude AI handles initial customer inquiries
- ✅ **Multi-Channel Support** - Chat, Email, SMS in one platform
- ✅ **Smart Escalation** - AI knows when to hand off to humans
- ✅ **Sentiment Analysis** - Track customer satisfaction in real-time
- ✅ **Knowledge Base** - Train AI with your company information
- ✅ **Real-Time Dashboard** - Monitor all conversations live
- ✅ **Analytics & Reporting** - Track resolution times, satisfaction, AI performance

### 💬 Conversation Features
- Real-time chat with WebSocket
- Conversation history
- Customer profiles
- Tag and categorize conversations
- Priority management
- Team assignment
- Resolution tracking

### 🤖 AI Capabilities
- Context-aware responses
- Learning from knowledge base
- Intent detection
- Entity extraction
- Multi-language support
- Confidence scoring
- Automatic escalation triggers

### 📊 Analytics
- Response time metrics
- AI resolution rate
- Customer satisfaction scores
- Sentiment breakdown
- Peak hour analysis
- Agent performance

---

## 🚀 Quick Deploy

### One-Click Railway Deploy

1. Click the "Deploy on Railway" button above
2. Add required services:
   - **PostgreSQL** (auto-provisioned)
   - **Redis** (auto-provisioned)
3. Set environment variables:
   - `ANTHROPIC_API_KEY` - Get from anthropic.com
   - Optional: Email and SMS credentials
4. Deploy completes in 2-3 minutes
5. Visit your app URL and start managing support!

### What Gets Deployed

- **Node.js Application** - AI-powered support server
- **PostgreSQL Database** - Customer data, conversations, knowledge base
- **Redis Cache** - Real-time features and session management
- **WebSocket Server** - Live updates and chat

---

## 📋 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | Auto-provided by Railway |
| `REDIS_URL` | Redis connection string | Yes | Auto-provided by Railway |
| `ANTHROPIC_API_KEY` | Claude AI API key | Yes | None |
| `PORT` | Application port | No | 3000 |
| `NODE_ENV` | Environment | No | production |
| `SMTP_HOST` | Email server hostname | No | None |
| `SMTP_PORT` | Email server port | No | 587 |
| `SMTP_USER` | Email username | No | None |
| `SMTP_PASS` | Email password | No | None |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | No | None |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | No | None |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | No | None |

### Getting API Keys

**Anthropic API Key** (Required):
1. Go to https://console.anthropic.com/
2. Create account or sign in
3. Navigate to API Keys
4. Create new key
5. Copy and add to Railway environment variables

**Email Setup** (Optional):
- Gmail: Use app-specific password
- SendGrid: Get API key from dashboard
- Mailgun: Get SMTP credentials

**SMS Setup** (Optional):
1. Sign up at twilio.com
2. Get Account SID and Auth Token
3. Purchase a phone number
4. Add credentials to Railway

---

## 💻 Usage

### Starting a Conversation

**Via Chat Widget:**
```javascript
// Embed in your website
<div id="support-chat"></div>
<script src="https://your-app.railway.app/widget.js"></script>
```

**Via API:**
```bash
# Create customer
curl -X POST https://your-app.railway.app/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Doe"
  }'

# Start conversation
curl -X POST https://your-app.railway.app/api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "channel": "chat",
    "subject": "Need help with product",
    "initialMessage": "Hi, I have a question about your service"
  }'
```

### Managing Knowledge Base

Add articles to improve AI responses:

```bash
curl -X POST https://your-app.railway.app/api/knowledge-base \
  -H "Content-Type: application/json" \
  -d '{
    "title": "How to reset password",
    "content": "To reset your password, click Forgot Password...",
    "category": "Account",
    "tags": ["password", "account", "security"]
  }'
```

### Escalating to Human Agent

```bash
curl -X POST https://your-app.railway.app/api/conversations/123/escalate \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer requires technical assistance",
    "assigned_to": "agent@company.com"
  }'
```

### Resolving Conversations

```bash
curl -X POST https://your-app.railway.app/api/conversations/123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "satisfaction_rating": 5
  }'
```

---

## 📊 API Reference

### Customers

**Create Customer:**
```
POST /api/customers
Body: { email, phone, name, company, language, timezone }
```

**Get Customers:**
```
GET /api/customers
```

### Conversations

**Start Conversation:**
```
POST /api/conversations
Body: { customer_id, channel, subject, initialMessage }
```

**Get Conversations:**
```
GET /api/conversations?status=open&escalated=false
```

**Get Conversation Details:**
```
GET /api/conversations/:id
```

**Send Message:**
```
POST /api/conversations/:id/messages
Body: { sender_type, sender_name, content }
```

**Escalate:**
```
POST /api/conversations/:id/escalate
Body: { reason, assigned_to }
```

**Resolve:**
```
POST /api/conversations/:id/resolve
Body: { satisfaction_rating }
```

### Knowledge Base

**Add Article:**
```
POST /api/knowledge-base
Body: { title, content, category, tags }
```

**Search Articles:**
```
GET /api/knowledge-base?category=Account&search=password
```

### Analytics

**Get Dashboard Stats:**
```
GET /api/dashboard
```

Returns:
- Open conversations
- Escalated conversations
- Resolved today
- Average satisfaction
- AI resolution rate
- Average resolution time

---

## 🎨 Customization

### AI Behavior

Edit the system prompt in `server.js`:

```javascript
this.systemPrompt = `You are a helpful, professional customer service agent for [YOUR COMPANY].

Your guidelines:
- Always be friendly and professional
- Our return policy is [POLICY]
- Shipping takes [TIME]
- ...
`;
```

### Escalation Rules

Customize when to escalate to humans:

```javascript
detectEscalationNeeded(aiMessage, messages) {
  // Add your custom rules
  const isComplexIssue = messages.length > 10;
  const mentionsRefund = aiMessage.includes('refund');
  
  return isComplexIssue || mentionsRefund;
}
```

### Multi-Language Support

Add language detection and response:

```javascript
// In generateResponse method
const detectedLanguage = detectLanguage(messages);
this.systemPrompt = `Respond in ${detectedLanguage}. ...`;
```

---

## 🔌 Integrations

### Slack Notifications

Get notified of escalations:

```javascript
// Add to escalation handler
await axios.post(process.env.SLACK_WEBHOOK_URL, {
  text: `🚨 Conversation escalated: ${reason}`
});
```

### CRM Integration

Sync with Salesforce, HubSpot, etc:

```javascript
// Add to customer creation
await syncToCRM(customer);
```

### Analytics Integration

Send events to Mixpanel, Segment:

```javascript
analytics.track('conversation_resolved', {
  duration: resolutionTime,
  satisfaction: rating
});
```

---

## 📈 Use Cases

### E-commerce Support
- Order status inquiries
- Shipping questions
- Product information
- Returns and refunds

### SaaS Support
- Technical troubleshooting
- Account management
- Feature requests
- Bug reports

### Service Businesses
- Appointment booking
- Service inquiries
- Quote requests
- General questions

### Agency Use
- Multi-client management
- White-label deployment
- Client reporting
- Team collaboration

---

## 🛠️ Development

### Local Setup

```bash
# Clone repository
git clone https://github.com/yourusername/ai-customer-service-agent
cd ai-customer-service-agent

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Start PostgreSQL and Redis (via Docker)
docker-compose up -d

# Run application
npm start

# Or with auto-reload
npm run dev
```

### Database Schema

The application automatically creates tables on first run:
- `customers` - Customer profiles
- `conversations` - Support conversations
- `messages` - Individual messages
- `knowledge_base` - AI training articles
- `auto_responses` - Automated responses
- `escalations` - Human escalation tracking
- `analytics` - Performance metrics

---

## 🔒 Security

### Best Practices Implemented
- ✅ Helmet.js for secure headers
- ✅ CORS configuration
- ✅ Rate limiting on API endpoints
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation
- ✅ SSL/TLS for database connections

### Recommendations
- Use strong API keys
- Enable HTTPS (Railway provides automatically)
- Rotate credentials regularly
- Monitor for unusual activity
- Implement authentication for admin panel

---

## 💰 Pricing

**Self-Hosted (This Template):** FREE
- Unlimited conversations
- Unlimited agents
- All features included
- Your infrastructure costs only

**Railway Hosting Cost:** ~$10-30/month
- Depends on usage
- Scales automatically
- Includes database & Redis

**External Services:**
- Anthropic API: $3-15 per 1M tokens
- Twilio SMS: $0.0075-0.01 per message
- Email: Usually free (Gmail, SendGrid free tier)

**Total Cost Example:**
- 1,000 conversations/month
- ~500K AI tokens
- Railway: $15
- Anthropic: ~$2
- **Total: ~$17/month**

Compare to:
- Zendesk: $55-115/agent/month
- Intercom: $74-132/seat/month
- Freshdesk: $15-79/agent/month

---

## 🤝 Support

### Getting Help
- **Documentation:** Full docs included
- **Issues:** [GitHub Issues](https://github.com/yourusername/ai-customer-service-agent/issues)
- **Discord:** [Join our community](#)
- **Email:** support@yourapp.com

### Contributing
We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

Built with:
- [Express.js](https://expressjs.com/) - Web framework
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Caching
- [Socket.io](https://socket.io/) - Real-time communication
- [Anthropic Claude](https://anthropic.com/) - AI capabilities
- [Railway](https://railway.app/) - Hosting platform

---

**Ready to deploy AI-powered customer support?** Click the Railway button above! 🚀

Questions? Open an issue or reach out to [your-email@example.com]
