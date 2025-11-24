# Sprint 54: Implementation Notes

## Architecture Decisions

### Command Palette Architecture
- Use portal for modal rendering (avoid z-index issues)
- Fuzzy search via Fuse.js for fast client-side matching
- Command registry is centralized in Zustand store
- Commands can be context-aware (different commands in different pages)

### Copilot Suggestions Strategy
- Debounce: 300ms after typing stops
- Context window: last 5 messages + current page + selected entity
- Suggestion types:
  - **Command suggestions:** "Try /enrich to get more data"
  - **Completion suggestions:** Complete partial queries
  - **Action suggestions:** "You might want to filter by industry"

### SSE Reconnection Strategy
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
- Use `Last-Event-ID` header for resumption
- Connection states: `connected` | `disconnected` | `reconnecting` | `error`
- Visual indicator in chat header

### Offline Queue Design
- IndexedDB table: `offline_messages`
- Schema: `{ id, message, timestamp, status, retryCount }`
- Max queue size: 100 messages
- Sync order: FIFO with timestamp ordering

---

## Technical Notes

### Keyboard Shortcuts
```typescript
// Global shortcuts (always active)
Cmd+K / Ctrl+K → Open Command Palette
Cmd+/ / Ctrl+/ → Focus chat input
Esc → Close modals, clear selection

// Chat-specific shortcuts
Enter → Send message
Shift+Enter → New line
Tab → Accept copilot suggestion
```

### SIVA Tool Registration
```python
# Tool schema format
{
  "name": "MessageGen",
  "description": "Generate personalized outreach messages",
  "autonomy": "DELEGATED",  # Requires approval
  "parameters": {
    "lead_id": "string",
    "tone": "enum[professional, casual, urgent]",
    "include_personalization": "boolean"
  },
  "chat_trigger": ["generate message", "write email", "draft outreach"]
}
```

### SSE Event Types for SIVA
```
siva:tool_start     → Tool execution started
siva:tool_progress  → Intermediate results
siva:tool_complete  → Final results
siva:tool_error     → Execution failed
siva:approval_needed → Requires user confirmation
```

---

## Questions to Resolve

1. [ ] Should command palette support nested commands (submenus)?
2. [ ] What's the maximum suggestion length for copilot?
3. [ ] How do we handle conflicting offline messages?
4. [ ] Should alerts have sound notifications by default?

---

## Dependencies Discovered

- Need to install Fuse.js for fuzzy search
- May need idb library for IndexedDB wrapper
- Consider react-hotkeys-hook for keyboard shortcuts

---

## Performance Considerations

- Command palette: Pre-load command registry on app init
- Copilot: Cache last 10 suggestions per context
- SSE: Single connection, multiplexed channels
- Offline: Batch sync up to 10 messages per request

---

## Log

| Date | Note |
|------|------|
| 2025-11-22 | Sprint 54 folder created, initial planning complete |
