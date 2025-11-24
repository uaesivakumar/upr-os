# Event & Streaming Audit

**Purpose:** AI-first UX lives on real-time events
**Generated:** 2025-11-22
**Report Type:** Roadmap Rebuild - Report 4 of 6

---

## Executive Summary

This audit catalogs all Server-Sent Events (SSE), WebSocket, and real-time data patterns in the codebase. The goal is to identify opportunities to standardize streaming across the product beyond just the chat interface.

### Streaming Inventory Stats
| Category | Count | Status |
|----------|-------|--------|
| **SSE Endpoints** | 3 | Production |
| **WebSocket Endpoints** | 0 | None implemented |
| **Polling Patterns** | 2 | Frontend simulation |
| **React Query Hooks** | 1 | Standardized data fetching |

### Key Finding

**Streaming is fragmented.** Two SSE endpoints exist (Chat + Agent Activity), but the Agent Activity stream is **not consumed by the frontend**. The SIVA page uses `setInterval` polling instead of the available SSE endpoint.

---

## Part 1: SSE Endpoints (Backend)

### Endpoint 1: Chat Stream (POST)

**Route:** `POST /api/chat/stream`
**File:** `routes/chat.js:440-580`
**Purpose:** Send message and receive streaming LLM response
**Rate Limit:** 30 requests/minute

#### SSE Headers
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
```

#### Event Types Emitted
| Event Type | Payload | Description |
|------------|---------|-------------|
| `session` | `{ session_id }` | Session created/resumed |
| `intent` | `{ intent, confidence, entities }` | Intent recognition result |
| `tools_start` | `{ tools: string[] }` | SIVA tools about to execute |
| `tool_result` | `{ tool, output, latency_ms, success }` | Individual tool completion |
| `tool_error` | `{ tool, error }` | Tool execution failed |
| `response_start` | `{}` | LLM response generation starting |
| `text` | `{ content }` | Streaming text chunk |
| `done` | `{ metadata: { model, latency_ms, tokens } }` | Stream complete |
| `error` | `{ error }` | Fatal error occurred |

#### Message Format
```
data: {"type":"text","content":"Here is"}\n\n
data: {"type":"text","content":" the analysis"}\n\n
data: {"type":"done","metadata":{"model":"claude-3-haiku","latency_ms":1234}}\n\n
```

#### Heartbeat
```
: heartbeat\n\n
```
Sent every 30 seconds to keep connection alive.

---

### Endpoint 2: Chat Stream (GET)

**Route:** `GET /api/chat/stream`
**File:** `routes/chat.js:406-437`
**Purpose:** Connect to real-time chat updates for a session
**Rate Limit:** 30 requests/minute

#### Event Types Emitted
| Event Type | Payload | Description |
|------------|---------|-------------|
| `connected` | `{ message, timestamp }` | Connection established |

#### Connection Management
```javascript
const sseClients = new Map();  // sessionId -> response
```
- Clients tracked by session ID or user ID
- Heartbeat every 30 seconds
- Cleanup on disconnect

---

### Endpoint 3: Agent Activity Stream

**Route:** `GET /api/agents/activity/stream`
**File:** `routes/agents/activity.js:228-268`
**Purpose:** Real-time SIVA agent activity feed
**Rate Limit:** None (consider adding)

#### Event Types Emitted
| Event Type | Payload | Description |
|------------|---------|-------------|
| `connected` | `{ message, timestamp }` | Connection established |
| `initial_data` | `{ data: AgentEvent[], timestamp }` | Last 10 events on connect |
| `agent_action` | `{ data: AgentEvent, timestamp }` | New agent action occurred |

#### AgentEvent Schema
```typescript
interface AgentEvent {
  id: string;                    // "evt_123"
  agentType: AgentType;          // "lead" | "research" | "validation" | "outreach" | "system"
  action: string;                // "Enriched lead profile"
  target: string;                // Company name
  confidence: number;            // 60-100
  timestamp: string;             // ISO date
  reasoning?: string;            // Detailed explanation (PII redacted)
  outcome: "success" | "in_progress" | "failure";
  metadata: {
    entityId: string;
    entityType: string;
    sources: string[];
    processingTime: number;      // ms
    cost?: number;               // USD
  };
}
```

#### Security Features
- **PII Redaction:** Emails, phone numbers, SSN, credit cards automatically redacted
- `sanitizeEvent()` function applied before broadcasting

#### Broadcast Pattern
```javascript
function broadcastEvent(event) {
  const message = `data: ${JSON.stringify({
    type: 'agent_action',
    data: event,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  clients.forEach((client) => {
    client.write(message);
  });
}
```

---

## Part 2: Frontend Stream Consumption

### Chat Streaming (IMPLEMENTED)

**Service:** `dashboard/src/services/chatApiService.ts`
**Consumer:** `dashboard/src/components/chat/Chat.tsx`

#### Implementation Pattern
```typescript
async *sendMessageStream(
  message: string,
  sessionId?: string,
  context?: ContextInfo
): AsyncGenerator<StreamChunk, void, unknown> {
  this.abortController = new AbortController();

  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    signal: this.abortController.signal,
    // ...
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // Parse SSE messages from buffer
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
```

#### Stream Cancellation
```typescript
cancelStream(): void {
  if (this.abortController) {
    this.abortController.abort();
    this.abortController = null;
  }
}
```

#### Fallback Pattern
```typescript
// In Chat.tsx:156-183
try {
  // Try streaming first
  for await (const chunk of chatApi.sendMessageStream(...)) { ... }
} catch (err) {
  // Fallback to non-streaming API
  console.warn('Streaming failed, falling back to standard API:', err);
  const response = await chatApi.sendMessage(...);
}
```

---

### Agent Activity Streaming (NOT IMPLEMENTED)

**Backend Available:** YES (`GET /api/agents/activity/stream`)
**Frontend Consuming:** NO

#### Current Pattern (Polling Simulation)
**File:** `dashboard/src/pages/SIVAPage.tsx:39-58`

```typescript
useEffect(() => {
  // Load initial events (mock data)
  const initialEvents = generateMockEvents(50);
  setAllEvents(initialEvents);

  // Simulate real-time updates every 5 seconds
  const interval = setInterval(() => {
    const newEvents = generateMockEvents(1);
    setAllEvents((prev) => [newEvent, ...prev].slice(0, 200));
  }, 5000);

  return () => clearInterval(interval);
}, []);
```

#### GAP: Should be using EventSource
```typescript
// RECOMMENDED: Use SSE instead of polling
useEffect(() => {
  const eventSource = new EventSource('/api/agents/activity/stream');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'agent_action') {
      setAllEvents((prev) => [data.data, ...prev].slice(0, 200));
    }
  };

  return () => eventSource.close();
}, []);
```

---

### EventSource Usage (Chat Only)

**File:** `dashboard/src/services/chatApiService.ts:248-275`

```typescript
connectToStream(
  sessionId: string,
  onMessage: (event: StreamChunk) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(
    `${this.baseUrl}/chat/stream?session_id=${sessionId}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  eventSource.onerror = () => {
    onError?.(new Error('Connection lost'));
    eventSource.close();
  };

  // Return cleanup function
  return () => eventSource.close();
}
```

---

## Part 3: Backpressure & Fallback Patterns

### Backpressure Patterns

#### 1. Server-Side Rate Limiting (Chat)
**Implementation:** `express-rate-limit`
**Config:** 30 requests/minute per user

```javascript
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retry_after_ms: 60000,
    });
  }
});
```

#### 2. Client-Side Rate Limiting
**File:** `dashboard/src/services/rateLimiter.ts`

```typescript
class RateLimiter {
  maxRequests: 50;
  windowMs: 60000;  // 1 minute
  retryAfterMs: 5000;

  check(key): RateLimitInfo;
  record(key): RateLimitInfo;
  getRetryAfter(key): number;
}
```

#### 3. React Query Stale Time
**File:** `dashboard/src/lib/queryClient.ts`

```typescript
defaultOptions: {
  queries: {
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 10 * 60 * 1000,         // 10 minutes cache
    retry: 3,                        // 3 retries with backoff
    refetchOnWindowFocus: false,    // In development
    refetchOnReconnect: true,
  },
}
```

### Fallback Patterns

#### 1. Stream → Standard API Fallback
**Location:** `Chat.tsx:156-183`
```typescript
// If streaming fails, fallback to non-streaming API
catch (err) {
  const response = await chatApi.sendMessage(...);
}
```

#### 2. SSE Client Tracking
**Location:** `routes/chat.js:44`
```javascript
const sseClients = new Map();  // Session-based tracking
```
- Clients tracked by session ID
- Automatic cleanup on disconnect
- Heartbeat to prevent timeout

#### 3. Agent Activity Broadcast
**Location:** `routes/agents/activity.js:145-157`
```javascript
// All connected clients receive updates
clients.forEach((client) => {
  client.write(message);
});
```

### Missing Patterns (GAPS)

| Pattern | Status | Recommendation |
|---------|--------|----------------|
| Reconnection logic | MISSING | Add `retry` to EventSource |
| Exponential backoff | PARTIAL | Only in React Query |
| Connection health monitoring | MISSING | Add ping/pong heartbeat check |
| Offline queue | MISSING | Queue messages when disconnected |
| Message deduplication | MISSING | Track message IDs to prevent duplicates |

---

## Part 4: Current vs. Recommended Architecture

### Current State

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Chat Component ──────► chatApiService.sendMessageStream()   │
│       │                        │                             │
│       ▼                        ▼                             │
│  POST /api/chat/stream   (SSE consumption ✓)                 │
│                                                              │
│  SIVA Page ──────────► setInterval + generateMockEvents()    │
│       │                        │                             │
│       ▼                        ▼                             │
│  [Mock data polling]    (SSE NOT used ✗)                     │
│                                                              │
│  Other Pages ──────────► React Query (REST polling)          │
│       │                        │                             │
│       ▼                        ▼                             │
│  [Standard REST]         (No real-time ✗)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Chat Router ──► SSE POST /api/chat/stream         [USED]    │
│              ──► SSE GET /api/chat/stream          [UNUSED]  │
│                                                              │
│  Agent Activity ──► SSE GET /api/agents/activity/stream      │
│                         [AVAILABLE BUT FRONTEND NOT USING]   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Recommended State

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │     Unified Stream Manager           │                    │
│  │  - Connection pooling                │                    │
│  │  - Auto-reconnect                    │                    │
│  │  - Message deduplication             │                    │
│  │  - Offline queue                     │                    │
│  └──────────────────────────────────────┘                    │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│   Chat Events   Agent Events   Lead Events                   │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  Chat Component  SIVA Page    Leads Page                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │     Unified Event Bus (Redis?)       │                    │
│  │  - Pub/Sub for all event types       │                    │
│  │  - Event persistence                 │                    │
│  │  - Replay capability                 │                    │
│  └──────────────────────────────────────┘                    │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  Chat Events   Agent Events   SIVA Tool Events               │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  POST /stream    GET /stream    (New endpoints)              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 5: Streaming Standardization Opportunities

### Opportunity 1: Connect SIVA Page to Real SSE

**Effort:** Low (endpoint exists)
**Impact:** High (real-time agent monitoring)

Replace `setInterval` polling with EventSource:
```typescript
// dashboard/src/hooks/useAgentActivityStream.ts
export function useAgentActivityStream() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/agents/activity/stream');

    eventSource.onopen = () => setIsConnected(true);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'initial_data') {
        setEvents(data.data);
      } else if (data.type === 'agent_action') {
        setEvents(prev => [data.data, ...prev].slice(0, 200));
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // Reconnect after 5 seconds
      setTimeout(() => eventSource.close(), 5000);
    };

    return () => eventSource.close();
  }, []);

  return { events, isConnected };
}
```

### Opportunity 2: Lead Enrichment Progress Stream

**Effort:** Medium (new endpoint needed)
**Impact:** High (real-time enrichment status)

Current: Polling via `useLeadEnrichment` hook
Recommended: SSE endpoint for enrichment progress

```javascript
// New endpoint: GET /api/enrichment/stream
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  // Stream enrichment progress events
  res.write(`data: ${JSON.stringify({
    type: 'enrichment_progress',
    leadId: '123',
    progress: 45,
    status: 'enriching'
  })}\n\n`);
});
```

### Opportunity 3: SIVA Tool Execution Stream

**Effort:** Medium (extend existing pattern)
**Impact:** High (real-time tool transparency)

Extend Chat streaming to expose tool execution events:
```typescript
// Event types to add
| `tool_executing` | Tool execution started |
| `tool_progress` | Intermediate progress (for long-running tools) |
| `tool_citation` | Evidence/citation found |
```

### Opportunity 4: Unified Stream Manager

**Effort:** High (new architecture)
**Impact:** Very High (standardized real-time across product)

Create `StreamManager` class:
```typescript
class StreamManager {
  private connections: Map<string, EventSource>;
  private subscriptions: Map<string, Set<Function>>;

  connect(channel: 'chat' | 'agents' | 'enrichment'): void;
  disconnect(channel: string): void;
  subscribe(channel: string, callback: Function): () => void;

  // Automatic reconnection
  private reconnect(channel: string): void;

  // Message deduplication
  private isDuplicate(messageId: string): boolean;
}
```

---

## Part 6: Event Type Catalog

### All Event Types (Unified Schema)

| Source | Event Type | Schema |
|--------|------------|--------|
| Chat | `session` | `{ session_id: string }` |
| Chat | `intent` | `{ intent: string, confidence: number, entities: Entity[] }` |
| Chat | `tools_start` | `{ tools: string[] }` |
| Chat | `tool_result` | `{ tool: string, output: any, latency_ms: number, success: boolean }` |
| Chat | `tool_error` | `{ tool: string, error: string }` |
| Chat | `response_start` | `{}` |
| Chat | `text` | `{ content: string }` |
| Chat | `done` | `{ metadata: { model, latency_ms, tokens } }` |
| Chat | `error` | `{ error: string }` |
| Agent | `connected` | `{ message: string, timestamp: string }` |
| Agent | `initial_data` | `{ data: AgentEvent[], timestamp: string }` |
| Agent | `agent_action` | `{ data: AgentEvent, timestamp: string }` |

### Recommended Unified Event Schema

```typescript
interface StreamEvent {
  id: string;           // Unique event ID for deduplication
  type: string;         // Event type
  source: string;       // 'chat' | 'agent' | 'enrichment' | 'outreach'
  timestamp: string;    // ISO date
  payload: unknown;     // Event-specific data
  correlationId?: string; // For tracking related events
}
```

---

## Conclusion & Recommendations

### Immediate Actions (Sprint 54)

1. **Connect SIVA page to real SSE** - Agent Activity endpoint exists but unused
2. **Add reconnection logic** to chat streaming
3. **Implement message deduplication** for all streams

### Short-Term (Sprint 55-56)

4. **Create `useStreamManager` hook** for unified stream consumption
5. **Add enrichment progress streaming** endpoint
6. **Implement offline queue** for chat messages

### Long-Term (Sprint 57+)

7. **Redis Pub/Sub event bus** for scalable streaming
8. **Event persistence** for replay capability
9. **WebSocket upgrade** if bidirectional communication needed

### Why This Matters for AI-First UX

AI-first UX requires:
- **Immediate feedback** on AI actions (streaming)
- **Transparency** into tool execution (step events)
- **Resilience** when connections drop (fallbacks)
- **Consistency** across the product (unified patterns)

Current state: Streaming exists but is fragmented and inconsistent.
Target state: Unified streaming architecture enabling real-time AI transparency everywhere.
