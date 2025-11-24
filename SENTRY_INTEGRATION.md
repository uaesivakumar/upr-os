# Sentry Error Monitoring Integration

**Status:** Ready to activate
**Cost:** Free tier (5,000 errors/month)

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Sign Up for Sentry
1. Go to https://sentry.io
2. Sign up with GitHub or email
3. Choose "Free" plan (5K errors/month)
4. Create a new project:
   - Platform: Node.js (for backend)
   - Project name: `upr-production`
5. Copy your DSN (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

### Step 2: Add DSN to Environment
```bash
# Add to your shell profile (~/.zshrc or ~/.bashrc)
export SENTRY_DSN="https://your-dsn-here"
export VITE_SENTRY_DSN="https://your-dsn-here"

# Reload shell
source ~/.zshrc

# Or add to .env file (don't commit!)
echo "SENTRY_DSN=https://your-dsn-here" >> .env
echo "VITE_SENTRY_DSN=https://your-dsn-here" >> .env
```

### Step 3: Install Sentry Packages
```bash
npm install --save @sentry/node @sentry/react
```

### Step 4: Integrate Backend (server.js)

Add these lines at the TOP of `server.js` (before any other imports):

```javascript
// At the very top of server.js
const { initSentry, sentryRequestHandler, sentryErrorHandler } = require('./utils/sentry');

// Initialize Sentry BEFORE express app
const Sentry = initSentry();

const express = require('express');
// ... rest of your imports

const app = express();

// Add Sentry request handler FIRST (after app creation)
if (Sentry) {
  app.use(sentryRequestHandler());
}

// ... your middleware (cors, body-parser, etc.)

// ... your routes

// Add Sentry error handler BEFORE your error handlers
if (Sentry) {
  app.use(sentryErrorHandler());
}

// ... your error handlers
```

### Step 5: Integrate Frontend (main.jsx)

Add to the TOP of `dashboard/src/main.jsx`:

```javascript
import React from "react";
import ReactDOM from "react-dom/client";
import { initSentry } from "./sentry";  // Add this
import App from "./App.jsx";
import "./index.css";

// Initialize Sentry FIRST
initSentry();

// ... rest of your code
```

### Step 6: Test It

```bash
# Deploy with Sentry enabled
npm run deploy "feat: add Sentry error monitoring"

# Trigger a test error to verify
curl https://your-service-url/api/test-sentry-error

# Check Sentry dashboard - you should see the error!
```

---

## 📊 What You Get

### Automatic Tracking:
- ✅ All unhandled exceptions
- ✅ Promise rejections
- ✅ API errors (4xx, 5xx)
- ✅ Frontend crashes
- ✅ Stack traces with context
- ✅ User session replays (on errors)
- ✅ Performance monitoring

### Notifications:
- Email alerts on new errors
- Slack integration (optional)
- Weekly digest reports
- Error trends and patterns

---

## 💡 Using Sentry in Code

### Backend Error Tracking

```javascript
const { captureException, setUser } = require('./utils/sentry');

// Wrap risky operations
try {
  const result = await riskyOperation();
} catch (error) {
  // Automatically sent to Sentry with full context
  captureException(error, {
    operation: 'riskyOperation',
    userId: req.user?.id,
    extra: { someData: 'context' }
  });
  res.status(500).json({ error: 'Something went wrong' });
}

// Set user context (in auth middleware)
if (req.user) {
  setUser(req.user);
}
```

### Frontend Error Tracking

```javascript
import { captureException, setUser } from './sentry';

// Track errors in async operations
async function fetchData() {
  try {
    const response = await api.get('/data');
    return response.data;
  } catch (error) {
    captureException(error, {
      component: 'DataFetcher',
      endpoint: '/data'
    });
    throw error;
  }
}

// Set user context after login
function handleLogin(user) {
  setUser({
    id: user.id,
    email: user.email,
    username: user.username
  });
}
```

### Error Boundary (React)

```javascript
// Create ErrorBoundary.jsx
import * as Sentry from "@sentry/react";

function ErrorBoundary({ children }) {
  return (
    <Sentry.ErrorBoundary
      fallback={<div>Something went wrong. We've been notified!</div>}
      showDialog
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

// Wrap your app in main.jsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## 🔍 Sentry Dashboard Features

### Issues Tab
- See all errors grouped by type
- Filter by: new, unhandled, assigned
- View frequency, users affected
- See full stack trace

### Performance Tab
- API endpoint response times
- Slow database queries
- Frontend page load times
- Identify bottlenecks

### Releases Tab
- Track errors by deployment
- Compare error rates across versions
- See which commit introduced bugs

### Alerts
- Set rules: "If error count > 10/hour, notify"
- Slack webhook integration
- PagerDuty integration

---

## 🎯 Best Practices

### 1. Add Context to Errors
```javascript
captureException(error, {
  tags: {
    service: 'enrichment-worker',
    priority: 'high'
  },
  extra: {
    companyId: company.id,
    signalCount: signals.length
  }
});
```

### 2. Filter Out Noise
Already configured in `utils/sentry.js`:
- Health check errors ignored
- Dev tool errors filtered
- Only 4xx/5xx captured

### 3. Set Up Release Tracking
```bash
# In deploy script, add:
export SENTRY_RELEASE=$(git rev-parse --short HEAD)

# Sentry will track which commit caused errors
```

### 4. Use Breadcrumbs
```javascript
Sentry.addBreadcrumb({
  category: 'enrichment',
  message: 'Starting company enrichment',
  level: 'info',
  data: { companyId: '123' }
});
```

---

## 🚨 Troubleshooting

### Sentry not capturing errors?

**Check DSN is set:**
```bash
echo $SENTRY_DSN
echo $VITE_SENTRY_DSN
```

**Check console logs:**
- Should see: "✅ Sentry initialized for backend"
- Should see: "✅ Sentry initialized for frontend"

**Test manually:**
```javascript
// In server.js, add test route:
app.get('/test-sentry', (req, res) => {
  throw new Error('Sentry test error!');
});

// Visit: https://your-url/test-sentry
// Check Sentry dashboard for error
```

### Too many errors?

**Increase sample rate:**
```javascript
// In utils/sentry.js
tracesSampleRate: 0.01,  // Only 1% of transactions
```

**Add more filters:**
```javascript
beforeSend(event) {
  // Ignore specific errors
  if (event.exception?.values?.[0]?.value?.includes('ECONNRESET')) {
    return null;
  }
  return event;
}
```

---

## 💰 Cost Management

### Free Tier Limits:
- 5,000 errors/month
- 10,000 performance units/month
- 1 user
- 30 days retention

### If You Exceed:
- Upgrade to Team plan: $26/month
- OR reduce sample rates
- OR add more filters

---

## 📈 ROI

**Time Saved:**
- No more "it's not working" without details
- Instant stack traces (was: hours of debugging)
- Proactive error detection (before users complain)

**Example:**
- User reports: "Something broke"
- Before: 30 min reproducing + 1 hour debugging
- After: Open Sentry → See exact error + context → 5 min fix

**Value:** ~5-10 hours/month saved

---

## 🔗 Resources

- **Sentry Dashboard:** https://sentry.io/organizations/your-org/
- **Docs:** https://docs.sentry.io/platforms/node/
- **React Guide:** https://docs.sentry.io/platforms/javascript/guides/react/

---

## ✅ Checklist

- [ ] Sign up at sentry.io
- [ ] Create project: upr-production
- [ ] Copy DSN
- [ ] Add to environment variables
- [ ] Run: `npm install --save @sentry/node @sentry/react`
- [ ] Integrate in server.js (see Step 4)
- [ ] Integrate in main.jsx (see Step 5)
- [ ] Deploy and test
- [ ] Check Sentry dashboard for test error
- [ ] Set up email alerts
- [ ] (Optional) Set up Slack integration

---

**Ready to catch errors before they catch you!** 🐛🔍
