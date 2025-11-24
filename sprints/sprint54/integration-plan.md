# Sprint 54: Cross-Layer Integration Plan

## Overview

Sprint 54 touches all layers of the UPR OS stack. This document outlines the integration strategy to ensure changes work together seamlessly.

---

## Layer Impact Matrix

| Layer | Components Affected | Risk Level |
|-------|---------------------|------------|
| **UI Layer** | CommandPalette, CopilotSuggestion, ProactiveAlert, ConnectionStatus | Medium |
| **NLU Layer** | Intent router, Tool triggers | Low |
| **Streaming Layer** | SSE reconnection, Offline queue, Event channels | High |
| **Backend** | Copilot API, Alert engine, Tool registry | Medium |
| **SIVA** | Tool registration, SSE integration | Medium |

---

## Integration Phases

### Phase 1: Foundation (Days 1-3)
**Goal:** Establish core infrastructure

1. **SSE Reconnection Logic**
   - Modify `sseService.ts` for exponential backoff
   - Add `Last-Event-ID` tracking
   - Create `ConnectionStatus` component
   - Test with simulated disconnects

2. **Keyboard Shortcut System**
   - Create `useKeyboardShortcuts` hook
   - Register global shortcuts
   - Ensure no conflicts with browser defaults

**Integration Point:** SSE reconnection must be stable before building features that depend on it.

### Phase 2: Core Features (Days 4-8)
**Goal:** Implement primary features

3. **Command Palette**
   - Depends on: Keyboard shortcuts
   - Connects to: Chat input, Navigation
   - Test: Open/close, command execution

4. **Copilot Suggestions**
   - Depends on: Chat context, API endpoint
   - Connects to: Chat input, NLU layer
   - Test: Suggestion display, Tab accept

5. **Proactive Alerts**
   - Depends on: SSE connection
   - Connects to: Alert engine (backend)
   - Test: Alert queue, dismissal

**Integration Point:** All features must respect the SSE connection state.

### Phase 3: Enhancement (Days 9-12)
**Goal:** Complete secondary features and integrations

6. **Smart Form Auto-Fill**
   - Depends on: Chat context extraction
   - Connects to: Form components
   - Test: Context detection, auto-fill accuracy

7. **Offline Message Queue**
   - Depends on: SSE reconnection
   - Connects to: Message store, IndexedDB
   - Test: Queue/sync cycle

8. **SIVA Tool Registration**
   - Depends on: Tool schemas
   - Connects to: NLU intent router, Chat UI
   - Test: Each tool via chat

### Phase 4: Integration Testing (Days 13-14)
**Goal:** End-to-end validation

- Full workflow tests
- Cross-browser testing
- Performance benchmarks
- Regression testing

---

## Data Flow Diagrams

### Command Palette Flow
```
User presses Cmd+K
       ↓
KeyboardShortcut hook triggers
       ↓
CommandPalette modal opens
       ↓
User types search query
       ↓
Fuse.js filters commands
       ↓
User selects command
       ↓
Command executor runs
       ↓
Modal closes, action executes
```

### Copilot Suggestion Flow
```
User types in chat input
       ↓
Debounce (300ms)
       ↓
Extract context (messages, page, entity)
       ↓
POST /api/copilot/suggest
       ↓
NLU processes context
       ↓
Return suggestion
       ↓
Display inline suggestion
       ↓
User presses Tab → Accept
User presses Esc → Dismiss
```

### SSE Reconnection Flow
```
Connection lost detected
       ↓
Set state: 'disconnected'
       ↓
Show ConnectionStatus indicator
       ↓
Start reconnection loop
       ↓
Wait (exponential backoff)
       ↓
Attempt reconnect with Last-Event-ID
       ↓
Success? → Set state: 'connected', process missed events
Failure? → Increment backoff, retry
       ↓
Max retries? → Set state: 'error', show manual reconnect
```

### SIVA Tool Execution via Chat
```
User: "Generate message for lead ABC"
       ↓
NLU Intent Engine
       ↓
Intent: generate_outreach
Tool: MessageGen
Entity: lead_id=ABC
       ↓
Check tool autonomy
       ↓
DELEGATED → Show approval dialog
       ↓
User approves
       ↓
Execute tool
       ↓
Stream results via SSE
       ↓
Render in chat
```

---

## API Endpoints Required

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/copilot/suggest` | POST | Get copilot suggestions | NEW |
| `/api/alerts/subscribe` | SSE | Stream proactive alerts | NEW |
| `/api/messages/sync` | POST | Sync offline messages | NEW |
| `/api/siva/tools` | GET | List registered tools | EXISTS |
| `/api/siva/execute` | POST | Execute SIVA tool | EXISTS |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SSE reconnection fails silently | Add connection health check, visible indicator |
| Offline queue grows too large | Set max queue size (100), show warning |
| Command palette conflicts with browser | Use metaKey detection, provide fallback |
| Copilot suggestions are slow | Cache, debounce, show loading state |
| Tool registration breaks existing tools | Add backwards compatibility layer |

---

## Rollback Plan

If integration fails:
1. Feature flags for each new component
2. Revert to last stable SSE implementation
3. Disable copilot suggestions server-side
4. Fall back to existing tool execution flow

---

## Success Metrics

| Metric | Target |
|--------|--------|
| SSE reconnection success rate | >99% |
| Command palette response time | <100ms |
| Copilot suggestion latency | <500ms |
| Offline sync success rate | >99% |
| Tool execution via chat | All 15 tools working |

---

## Sign-off Checklist

- [ ] All phase 1 components integrated
- [ ] All phase 2 components integrated
- [ ] All phase 3 components integrated
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] No regressions detected
- [ ] Documentation updated
- [ ] Ready for Sprint 55
