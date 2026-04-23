[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/ddWbPN?referralCode=ydtOV-&utm_medium=integration&utm_source=template&utm_campaign=generic)

# BuySell AI Scanner (MVP)

**Repository:** https://github.com/Jeah84/buysell-ai-scanner

MVP monorepo with:
- `web/`: React + Vite + Tailwind UI
- `api/`: Node + TypeScript + Express + Prisma (SQLite)

Features:
- Stylish UI with auth (email/password + JWT)
- Watchlist CRUD
- Email notifications (dev logs to console, prod uses SMTP)
- Free plan enforcement (hard server-side): max 10 watch items, 1 active connector, hourly scans
- Pro plan with Stripe subscription ($9.99/month)
- In-app Setup Guide at `/setup` to walk through going live
- Demo connector (fixture-based, no scraping)
- Match de-dupe by `user + listing URL`

---

## Quick Start (Local Dev)

### Requirements
- Node.js 20+
- npm 10+

### 1) Install deps
```bash
npm install --omit=optional
```

### 2) Configure API env
```bash
cp api/.env.example api/.env
```
Edit `api/.env` — defaults work for local SQLite dev (Stripe keys optional for local dev).

### 3) Run DB migrations
```bash
npm run db:migrate
```

### 4) Start API + Web
```bash
npm run dev
```
- UI: http://localhost:5173
- API: http://localhost:4000

### 5) Run scanner once (optional)
```bash
npm run scanner:once
```

### 6) Run tests
```bash
npm test
```

---

## Going Live — Production Setup

> **Tip:** Open `http://your-app-url/setup` in the browser after deploying for an interactive step-by-step checklist.

### Step 1 — Get Stripe API Keys

1. Go to https://dashboard.stripe.com → **Developers → API keys**
2. Copy your **Secret key** (starts with `sk_live_` for production, `sk_test_` for testing)
3. Set it as `STRIPE_SECRET_KEY` in your server environment

### Step 2 — Create a Stripe Product & Price

1. Go to https://dashboard.stripe.com → **Products → Add product**
2. Name it "BuySell AI Scanner Pro"
3. Add a **recurring price**: $9.99 / month
4. Click the price row → copy the **Price ID** (starts with `price_`)
5. Set it as `STRIPE_PRICE_ID_MONTHLY` in your server environment

### Step 3 — Set Up the Stripe Webhook

1. Go to https://dashboard.stripe.com → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://YOUR-API-DOMAIN/webhooks/stripe`
3. **Events to listen for:** `checkout.session.completed`
4. Click **Add endpoint** → copy the **Signing secret** (starts with `whsec_`)
5. Set it as `STRIPE_WEBHOOK_SECRET` in your server environment

### Step 4 — Set All Environment Variables on Your Server

| Variable | Description | Example |
|---|---|---|
| `PORT` | API port | `4000` |
| `JWT_SECRET` | Random secret for JWT signing | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_URL` | SQLite file path or Postgres URL | `file:./prod.db` |
| `APP_BASE_URL` | Full URL of your **web frontend** | `https://app.buysellscanner.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_PRICE_ID_MONTHLY` | Stripe monthly price ID | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `CRON_SECRET` | Secret for the `/cron/hourly` endpoint | any random string |
| `SMTP_HOST` | SMTP host for email alerts | `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `apikey` |
| `SMTP_PASS` | SMTP password / API key | |
| `SMTP_FROM` | Sender address | `alerts@yourdomain.com` |

### Step 5 — Deploy with Docker

```bash
docker build -t buysell-ai-scanner .
docker run -d \
  -p 4000:4000 \
  --env-file /path/to/prod.env \
  buysell-ai-scanner
```

Or push to any container hosting service (Railway, Render, Fly.io, etc.) using the included `Dockerfile`.

Point your web hosting (Netlify, Vercel, etc.) at the built `web/dist/` folder, with `VITE_API_URL` set to your API's public URL.

### Step 6 — Set Up the Hourly Cron

Add a cron job (or scheduled task) to trigger scans every hour:

```bash
curl -X POST https://YOUR-API-DOMAIN/cron/hourly \
  -H "x-cron-token: YOUR_CRON_SECRET"
```

On Linux (`crontab -e`):
```
0 * * * * curl -s -X POST https://YOUR-API-DOMAIN/cron/hourly -H "x-cron-token: YOUR_CRON_SECRET"
```

### Step 7 — Test the Upgrade Flow

1. Log into your app → click **Upgrade Now**
2. Complete checkout with a [Stripe test card](https://stripe.com/docs/testing#cards): `4242 4242 4242 4242`
3. You should be redirected to `/upgrade-success` and see "You're now a Pro member!"
4. Check the Stripe dashboard → **Webhooks** → confirm the `checkout.session.completed` event was delivered

---

## Hourly Cron (API reference)

- `POST /cron/hourly`
- Header: `x-cron-token: <CRON_SECRET>`
