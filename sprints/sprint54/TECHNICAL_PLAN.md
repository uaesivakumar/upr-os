# Sprint 54: Technical Execution Plan

**Generated from:** UPR_OS_MASTER_BLUEPRINT.md (CANONICAL)
**Sprint:** 54 - Chat OS Enhancement
**Goal:** Harden Chat Gateway as master interface

---

## Table of Contents

1. [Subsystem Overview](#1-subsystem-overview)
2. [File-Level Changes](#2-file-level-changes)
3. [Function-Level Changes](#3-function-level-changes)
4. [Dependency Graph](#4-dependency-graph)
5. [Testing Strategy](#5-testing-strategy)
6. [Backend-Frontend Sync Plan](#6-backend-frontend-sync-plan)
7. [Streaming Protocol Enhancements](#7-streaming-protocol-enhancements)
8. [Failover Logic](#8-failover-logic)
9. [Implementation Order](#9-implementation-order)

---

## 1. Subsystem Overview

Sprint 54 touches **14 subsystems** across the stack:

| # | Subsystem | Layer | Current State | Sprint 54 Changes |
|---|-----------|-------|---------------|-------------------|
| 1 | Chat TSX Components | Frontend | EXISTS (Chat.tsx, ChatWindow.tsx) | Add CommandPalette, CopilotSuggestion, ProactiveAlert |
| 2 | Streaming Service | Frontend | EXISTS (chatApiService.ts) | Add reconnection, backoff, Last-Event-ID |
| 3 | Unified Stream Manager | Frontend | NEW | Centralize all SSE connections |
| 4 | Agent Activity Stream | Frontend | PARTIAL | Connect SIVA page to real SSE |
| 5 | Offline Queue | Frontend | NEW | IndexedDB message queue |
| 6 | Deduplication | Frontend | NEW | Prevent duplicate messages on reconnect |
| 7 | Reconnect Logic | Frontend | PARTIAL | Exponential backoff, state machine |
| 8 | Rate Limit Handshake | Frontend | EXISTS (rateLimiter.ts) | Sync with backend headers |
| 9 | Session Manager | Frontend | PARTIAL | Persist session across reconnects |
| 10 | Page Context Injection | Frontend | EXISTS (Chat.tsx) | Enhance for copilot/commands |
| 11 | Fallback Pipeline | Frontend | PARTIAL | Non-streaming fallback on failure |
| 12 | Error Boundary | Frontend | NEW | Graceful error handling |
| 13 | NLU Service | Frontend | EXISTS (nluService.ts) | Add SIVA tool intents |
| 14 | Keyboard Shortcuts | Frontend | EXISTS (useKeyboardShortcuts.ts) | Extend for command palette |

---

## 2. File-Level Changes

### 2.1 New Files to Create

```
dashboard/src/
├── components/
│   ├── chat/
│   │   ├── CommandPalette.tsx          # Feature 1: Cmd+K command palette
│   │   ├── CommandPaletteItem.tsx      # Command palette list item
│   │   ├── CopilotSuggestion.tsx       # Feature 2: Inline suggestions
│   │   ├── ProactiveAlert.tsx          # Feature 3: Alert system
│   │   ├── ProactiveAlertQueue.tsx     # Alert queue manager
│   │   ├── ConnectionStatus.tsx        # Feature 5: Connection indicator
│   │   ├── OfflineIndicator.tsx        # Feature 6: Offline UI
│   │   └── ChatErrorBoundary.tsx       # Error boundary wrapper
│   └── siva/
│       └── SIVAStreamConnector.tsx     # Feature 7: Real SSE for SIVA
├── hooks/
│   ├── useCopilotSuggestions.ts        # Feature 2: Suggestion logic
│   ├── useUnifiedStream.ts             # Unified stream manager
│   ├── useOfflineQueue.ts              # Feature 6: Offline queue
│   ├── useConnectionState.ts           # Feature 5: Connection state machine
│   ├── useProactiveAlerts.ts           # Feature 3: Alert management
│   └── useSIVAStream.ts                # Feature 7: SIVA SSE hook
├── services/
│   ├── unifiedStreamManager.ts         # Central SSE manager
│   ├── offlineQueueService.ts          # IndexedDB queue
│   ├── copilotService.ts               # Feature 2: Backend copilot API
│   ├── alertService.ts                 # Feature 3: Alert rules engine
│   └── deduplicationService.ts         # Message deduplication
├── stores/
│   ├── useCommandStore.ts              # Feature 1: Command registry
│   ├── useAlertStore.ts                # Feature 3: Alert state
│   ├── useConnectionStore.ts           # Connection state
│   └── useChatStore.ts                 # Centralized chat state
└── types/
    ├── commands.ts                     # Command palette types
    ├── alerts.ts                       # Alert types
    └── streaming.ts                    # Streaming types
```

### 2.2 Existing Files to Modify

| File | Changes | Risk |
|------|---------|------|
| `dashboard/src/components/chat/Chat.tsx` | Import CommandPalette, wire up connection state, add error boundary | Medium |
| `dashboard/src/components/chat/ChatWindow.tsx` | Add CopilotSuggestion, connection status | Low |
| `dashboard/src/components/chat/ChatInput.tsx` | Tab-to-accept copilot suggestions | Low |
| `dashboard/src/services/chatApiService.ts` | Add reconnection logic, Last-Event-ID, event deduplication | High |
| `dashboard/src/services/nluService.ts` | Add 7 SIVA tool intent patterns | Medium |
| `dashboard/src/services/rateLimiter.ts` | Sync with backend rate limit headers | Low |
| `dashboard/src/hooks/useKeyboardShortcuts.ts` | Add command palette shortcuts, prevent input conflicts | Low |
| `dashboard/src/pages/SIVAPage.tsx` | Replace mock data with real SSE | Medium |
| `dashboard/src/App.tsx` | Wrap with error boundary, add global providers | Low |

---

## 3. Function-Level Changes

### 3.1 chatApiService.ts Enhancements

```typescript
// NEW: Connection state machine
type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'error';

// NEW: Reconnection configuration
interface ReconnectConfig {
  maxRetries: number;          // 10
  baseDelay: number;           // 1000ms
  maxDelay: number;            // 30000ms
  backoffMultiplier: number;   // 2
}

// MODIFY: sendMessageStream generator
async *sendMessageStream(
  message: string,
  sessionId?: string,
  context?: ContextInfo,
  lastEventId?: string  // NEW: Resume from last event
): AsyncGenerator<StreamChunk>

// NEW: Connection management methods
class ChatApiService {
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;
  private lastEventId: string | null = null;
  private eventHistory: Set<string> = new Set();  // For deduplication

  // NEW: Reconnect with exponential backoff
  private async reconnect(): Promise<void>

  // NEW: Calculate backoff delay
  private getBackoffDelay(): number

  // NEW: Check if event is duplicate
  private isDuplicate(eventId: string): boolean

  // NEW: Get connection state
  getConnectionState(): ConnectionState

  // NEW: Subscribe to connection changes
  onConnectionChange(callback: (state: ConnectionState) => void): () => void
}
```

### 3.2 nluService.ts - SIVA Tool Intents

```typescript
// ADD to IntentRecognizer.patterns
this.patterns = new Map([
  // ... existing patterns ...

  // NEW: SIVA Tool Intents (Feature 8)
  ['siva_message_gen', [
    /\b(generate|write|create|draft)\b.*\b(message|email|outreach)\b/i,
    /\bmessagegen\b/i,
  ]],
  ['siva_follow_up', [
    /\b(follow\s*up|reminder|check\s*in)\b/i,
    /\bfollowup\b/i,
  ]],
  ['siva_objection', [
    /\b(handle|respond\s*to|address)\b.*\bobjection\b/i,
    /\bobjection\b.*\b(handling|response)\b/i,
  ]],
  ['siva_timing_score', [
    /\b(best\s*time|optimal\s*time|when\s*to\s*contact)\b/i,
    /\btimingscore\b/i,
  ]],
  ['siva_contact_tier', [
    /\b(prioritize|rank|tier|score)\b.*\b(contacts?|leads?)\b/i,
    /\bcontacttier\b/i,
  ]],
  ['siva_product_match', [
    /\b(recommend|suggest|match)\b.*\bproducts?\b/i,
    /\bproductmatch\b/i,
  ]],
  ['siva_company_query', [
    /\b(company|organization)\b.*\b(info|data|details)\b/i,
    /\bcompanyquery\b/i,
  ]],
]);
```

### 3.3 New Stores

```typescript
// useCommandStore.ts
interface CommandStore {
  commands: Command[];
  recentCommands: string[];
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
  executeCommand: (id: string, args?: unknown) => Promise<void>;
  searchCommands: (query: string) => Command[];
}

// useConnectionStore.ts
interface ConnectionStore {
  state: ConnectionState;
  lastConnected: Date | null;
  reconnectAttempts: number;
  lastEventId: string | null;
  setConnectionState: (state: ConnectionState) => void;
  recordReconnectAttempt: () => void;
  resetReconnectAttempts: () => void;
}

// useAlertStore.ts
interface AlertStore {
  alerts: ProactiveAlert[];
  dismissedIds: Set<string>;
  addAlert: (alert: ProactiveAlert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  getActiveAlerts: () => ProactiveAlert[];
}
```

---

## 4. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx                                  │
│                    (ChatErrorBoundary)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Chat.tsx                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ useCommand  │  │ useConnect  │  │ useOfflineQueue         │ │
│  │ Store       │  │ ionStore    │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│ CommandPalette  │ │ ConnectionStatus│ │ offlineQueueService     │
│ ┌─────────────┐ │ │                 │ │ ┌─────────────────────┐ │
│ │ Fuse.js     │ │ │ State Machine   │ │ │ IndexedDB           │ │
│ │ (fuzzy)     │ │ │ Connected       │ │ │ offline_messages    │ │
│ └─────────────┘ │ │ Disconnected    │ │ └─────────────────────┘ │
└─────────────────┘ │ Reconnecting    │ └─────────────────────────┘
                    │ Error           │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   unifiedStreamManager.ts                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Chat SSE    │  │ SIVA SSE    │  │ Alert SSE               │ │
│  │ Channel     │  │ Channel     │  │ Channel                 │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│              ┌───────────┴───────────┐                         │
│              │ deduplicationService  │                         │
│              │ (eventHistory Set)    │                         │
│              └───────────┬───────────┘                         │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   chatApiService.ts                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Reconnect   │  │ Last-Event  │  │ Fallback Pipeline       │ │
│  │ Logic       │  │ -ID Tracking│  │ (non-streaming API)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend API                               │
│  /api/chat/stream      /api/siva/stream      /api/alerts/stream │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| CommandPalette | `CommandPalette.test.tsx` | 90% |
| CopilotSuggestion | `CopilotSuggestion.test.tsx` | 85% |
| ProactiveAlert | `ProactiveAlert.test.tsx` | 85% |
| ConnectionStatus | `ConnectionStatus.test.tsx` | 90% |
| useOfflineQueue | `useOfflineQueue.test.ts` | 95% |
| useConnectionState | `useConnectionState.test.ts` | 95% |
| deduplicationService | `deduplicationService.test.ts` | 100% |
| unifiedStreamManager | `unifiedStreamManager.test.ts` | 90% |

### 5.2 Integration Tests

```typescript
// streaming.integration.test.ts
describe('SSE Streaming Integration', () => {
  it('reconnects after disconnect with correct Last-Event-ID');
  it('deduplicates messages on reconnect');
  it('queues messages when offline');
  it('syncs queue on reconnect');
  it('falls back to non-streaming API on stream failure');
});

// command-palette.integration.test.ts
describe('Command Palette Integration', () => {
  it('opens with Cmd+K');
  it('searches commands with fuzzy matching');
  it('executes navigation commands');
  it('executes SIVA tool commands');
});

// siva-stream.integration.test.ts
describe('SIVA Stream Integration', () => {
  it('receives real-time tool execution events');
  it('updates UI on tool_start event');
  it('updates UI on tool_complete event');
  it('handles tool_error gracefully');
});
```

### 5.3 E2E Tests (Playwright)

```typescript
// chat-reconnect.e2e.ts
test('chat reconnects after network interruption', async ({ page }) => {
  // 1. Open chat
  // 2. Send message, verify response
  // 3. Simulate network disconnect
  // 4. Verify reconnecting indicator appears
  // 5. Restore network
  // 6. Verify connection restored
  // 7. Send another message, verify response
});

// offline-queue.e2e.ts
test('messages queue offline and sync on reconnect', async ({ page }) => {
  // 1. Open chat
  // 2. Go offline
  // 3. Send message
  // 4. Verify queued indicator
  // 5. Go online
  // 6. Verify message synced
});
```

---

## 6. Backend-Frontend Sync Plan

### 6.1 API Contract Updates

```yaml
# Chat Stream Endpoint
POST /api/chat/stream
Request:
  message: string
  session_id?: string
  context?: ContextInfo
Headers:
  Last-Event-ID?: string  # NEW: Resume from event

Response: SSE Stream
Events:
  - type: session
    session_id: string
    event_id: string  # NEW: Unique event ID
  - type: text
    content: string
    event_id: string
  - type: done
    event_id: string
    metadata: { model, tokens, latency_ms }
  - type: error
    error: string
    event_id: string

# Rate Limit Headers (NEW)
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1700000000

# SIVA Stream Endpoint
GET /api/siva/stream?tools=all
Response: SSE Stream
Events:
  - type: tool_start
    tool: string
    execution_id: string
  - type: tool_progress
    tool: string
    progress: number
    partial_result?: any
  - type: tool_complete
    tool: string
    result: any
    latency_ms: number
  - type: tool_error
    tool: string
    error: string
```

### 6.2 Sync Checklist

- [ ] Backend adds `event_id` to all SSE events
- [ ] Backend respects `Last-Event-ID` header for resumption
- [ ] Backend sends rate limit headers in chat responses
- [ ] Backend implements `/api/siva/stream` endpoint
- [ ] Frontend parses and stores event IDs
- [ ] Frontend sends `Last-Event-ID` on reconnect
- [ ] Frontend parses rate limit headers
- [ ] Frontend subscribes to SIVA stream on page load

---

## 7. Streaming Protocol Enhancements

### 7.1 Event ID Format

```
event_id = "{session_id}-{sequence_number}-{timestamp}"
Example: "sess_abc123-42-1700000000000"
```

### 7.2 SSE Message Format

```
id: sess_abc123-42-1700000000000
event: text
data: {"type":"text","content":"Hello","event_id":"sess_abc123-42-1700000000000"}

id: sess_abc123-43-1700000000050
event: done
data: {"type":"done","event_id":"sess_abc123-43-1700000000050","metadata":{...}}
```

### 7.3 Reconnection Protocol

```
1. Client detects disconnect (onerror or timeout)
2. Client sets state to 'reconnecting'
3. Client waits backoff delay (exponential: 1s, 2s, 4s, 8s, 16s, max 30s)
4. Client attempts reconnect with headers:
   - Last-Event-ID: {last_received_event_id}
5. Server resumes from event after Last-Event-ID
6. Server replays any missed events
7. Client deduplicates (in case of overlap)
8. Client sets state to 'connected'
9. Client resets backoff counter
```

### 7.4 Heartbeat Protocol

```
Server sends heartbeat every 15 seconds:
event: heartbeat
data: {"type":"heartbeat","timestamp":1700000000000}

Client tracks last heartbeat:
- If no heartbeat for 30s, assume disconnected
- Trigger reconnection
```

---

## 8. Failover Logic

### 8.1 Failover Pipeline

```
┌─────────────────────────────────────────────────────┐
│                   User Sends Message                 │
└───────────────────────────┬─────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│              Check Connection State                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Connected   │  │ Reconnecting│  │ Disconnected│ │
│  │ → Stream    │  │ → Queue     │  │ → Queue     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼─────────┘
          │                │                │
          ▼                └────────────────┘
┌─────────────────────┐                    │
│ Try SSE Stream      │                    │
│ POST /chat/stream   │                    ▼
└─────────┬───────────┘          ┌─────────────────────┐
          │                      │ Add to Offline Queue│
          │                      │ (IndexedDB)         │
          ▼                      └─────────┬───────────┘
┌─────────────────────┐                    │
│ Stream OK?          │                    │
│ ┌───────┐ ┌───────┐ │                    │
│ │ Yes   │ │ No    │ │                    │
│ └───┬───┘ └───┬───┘ │                    │
└─────┼─────────┼─────┘                    │
      │         │                          │
      │         ▼                          │
      │  ┌─────────────────────┐           │
      │  │ Fallback to REST    │           │
      │  │ POST /chat          │           │
      │  └─────────┬───────────┘           │
      │            │                       │
      │            ▼                       │
      │  ┌─────────────────────┐           │
      │  │ REST OK?            │           │
      │  │ ┌───────┐ ┌───────┐ │           │
      │  │ │ Yes   │ │ No    │ │           │
      │  │ └───┬───┘ └───┬───┘ │           │
      │  └─────┼─────────┼─────┘           │
      │        │         │                 │
      │        │         ▼                 │
      │        │  ┌─────────────────────┐  │
      │        │  │ Show Error          │  │
      │        │  │ Queue for Retry     │◄─┘
      │        │  └─────────────────────┘
      │        │
      ▼        ▼
┌─────────────────────┐
│ Display Response    │
└─────────────────────┘
```

### 8.2 Offline Queue Sync

```typescript
// On reconnect:
async function syncOfflineQueue() {
  const queue = await offlineQueueService.getAll();

  for (const message of queue) {
    try {
      // Send with flag indicating it was queued
      await chatApi.sendMessage(message.content, message.sessionId, {
        ...message.context,
        metadata: { queued_at: message.timestamp }
      });

      // Remove from queue on success
      await offlineQueueService.remove(message.id);
    } catch (error) {
      // Keep in queue, will retry on next sync
      await offlineQueueService.incrementRetry(message.id);

      // Max 3 retries, then mark as failed
      if (message.retryCount >= 3) {
        await offlineQueueService.markFailed(message.id);
      }
    }
  }
}
```

---

## 9. Implementation Order

### Phase 1: Foundation (Days 1-3)

```
Day 1:
├── Create useConnectionStore.ts
├── Create useConnectionState.ts hook
├── Modify chatApiService.ts - add connection state
├── Create ConnectionStatus.tsx component
└── Write unit tests for connection state

Day 2:
├── Create unifiedStreamManager.ts
├── Create deduplicationService.ts
├── Add Last-Event-ID tracking to chatApiService.ts
├── Add event_id parsing
└── Write unit tests for deduplication

Day 3:
├── Add reconnection logic with exponential backoff
├── Add heartbeat monitoring
├── Create fallback pipeline
├── Integration test: reconnection flow
└── Integration test: fallback pipeline
```

### Phase 2: Core Features (Days 4-8)

```
Day 4:
├── Create useCommandStore.ts
├── Create CommandPalette.tsx
├── Create CommandPaletteItem.tsx
├── Wire Cmd+K shortcut in Chat.tsx
└── Write unit tests for CommandPalette

Day 5:
├── Create copilotService.ts
├── Create useCopilotSuggestions.ts
├── Create CopilotSuggestion.tsx
├── Add Tab-to-accept in ChatInput.tsx
└── Write unit tests for Copilot

Day 6:
├── Create useAlertStore.ts
├── Create alertService.ts
├── Create ProactiveAlert.tsx
├── Create ProactiveAlertQueue.tsx
└── Write unit tests for alerts

Day 7:
├── Create offlineQueueService.ts (IndexedDB)
├── Create useOfflineQueue.ts
├── Create OfflineIndicator.tsx
├── Integrate offline queue with Chat.tsx
└── Write unit tests for offline queue

Day 8:
├── Add form auto-fill service
├── Create useFormAutoFill.ts
├── Wire form auto-fill to context
└── Write unit tests
```

### Phase 3: SIVA Integration (Days 9-11)

```
Day 9:
├── Create useSIVAStream.ts
├── Create SIVAStreamConnector.tsx
├── Modify SIVAPage.tsx - replace mock with real SSE
└── Write integration tests for SIVA stream

Day 10:
├── Add 7 SIVA tool intents to nluService.ts
├── Create tool result renderers
├── Wire tools to command palette
└── Write integration tests for tool execution

Day 11:
├── Create ChatErrorBoundary.tsx
├── Wrap Chat.tsx in error boundary
├── Add error recovery flows
└── Test error scenarios
```

### Phase 4: Integration & Polish (Days 12-14)

```
Day 12:
├── End-to-end integration testing
├── Cross-browser testing (Chrome, Firefox, Safari)
├── Fix integration bugs

Day 13:
├── Performance testing
├── Accessibility audit
├── Mobile responsiveness check

Day 14:
├── Documentation update
├── Code review fixes
├── Final regression testing
├── Update Notion sprint status
```

---

## Appendix A: NPM Dependencies

```json
{
  "dependencies": {
    "fuse.js": "^7.0.0",      // Fuzzy search for command palette
    "idb": "^8.0.0",          // IndexedDB wrapper for offline queue
    "zustand": "^4.4.0"       // Already exists, for new stores
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",  // Already exists
    "msw": "^2.0.0"           // Mock Service Worker for stream tests
  }
}
```

## Appendix B: Feature Flags

```typescript
// config/featureFlags.ts
export const SPRINT_54_FLAGS = {
  COMMAND_PALETTE_ENABLED: true,
  COPILOT_SUGGESTIONS_ENABLED: true,
  PROACTIVE_ALERTS_ENABLED: true,
  OFFLINE_QUEUE_ENABLED: true,
  SSE_RECONNECTION_ENABLED: true,
  SIVA_LIVE_STREAM_ENABLED: true,
  SIVA_TOOL_CHAT_ENABLED: true,
};
```

## Appendix C: Rollback Procedures

```bash
# Revert to pre-Sprint-54 state
git revert --no-commit HEAD~{n}..HEAD
git commit -m "Rollback Sprint 54 changes"

# Disable features via flags (no code revert)
# Set all SPRINT_54_FLAGS to false

# Restore SSE service to Sprint 53 version
git checkout sprint-53 -- dashboard/src/services/chatApiService.ts
```

---

**Document Status:** COMPLETE
**Generated:** 2025-11-22
**Author:** TC (Claude Code)
**Reference:** `/docs/UPR_OS_MASTER_BLUEPRINT.md` (CANONICAL)
