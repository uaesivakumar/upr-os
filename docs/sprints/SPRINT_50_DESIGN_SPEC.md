# Sprint 50 - SIVA Visualization Design Specification

**Version:** v2.0 (Enterprise-Grade)
**Feature:** Design agent visualization interface (Feature #10)
**Notion Reference:** Sprint 50 - Feature ID: `2b166151-dd16-818d-a364-f94afb1ee03b`
**Status:** Approved (Ready for Implementation)
**Date:** 2025-11-21
**Reviewed By:** SKC
**Design System Reference:** [Sprint 48 Design System](../SPRINT_48_HANDOFF.md)
**Figma/Design Files:** TBD (Tailwind-first approach)

---

## 🎨 Design Philosophy

**Core Concept:** "AI Insight Window" (Tagline: "See Your AI at Work")
- Make AI decision-making **transparent** and **understandable**
- Show **real-time activity** like a developer console, but beautiful
- Balance **information density** with **visual clarity**
- Leverage **Sprint 48 design system** (glassmorphism, modern cards, dark mode)
- **Enterprise-grade reliability**: Accessibility (WCAG 2.1 AA), Performance, Security

---

## 🧩 Component Architecture

### Component Hierarchy
```
<SIVAVisualizationPage>
  ├── <PageHeader> (Title, subtitle, refresh button)
  ├── <FilterBar> (Agent type, time range, confidence, outcome filters)
  ├── <MainContent>
  │   ├── <PerformanceDashboard> (Top section - metrics overview)
  │   └── <ContentGrid>
  │       ├── <ActivityFeed> (Left 60% - Live event stream)
  │       └── <CollaborationGraph> (Right 40% - Agent network)
  └── <DecisionModal> (Overlay - detailed reasoning view)
```

---

## 📐 Layout Wireframe

### Desktop Layout (1920x1080)
```
┌──────────────────────────────────────────────────────────────────┐
│ SIVA - AI Agents in Action                            🔄 Live    │
│ Real-time agent activity and reasoning                           │
├──────────────────────────────────────────────────────────────────┤
│ [Agent Type ▼] [Time Range ▼] [Confidence ▼] [Search...] [Clear]│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────┬────────────┬────────────┬────────────┐           │
│ │ Actions/Hr │Success Rate│Avg Confid. │Active Now  │           │
│ │    142     │   94.2%    │    87%     │     8      │           │
│ └────────────┴────────────┴────────────┴────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┬───────────────────────────────┐│
│ │ ACTIVITY FEED                │ COLLABORATION NETWORK         ││
│ │ ┌──────────────────────────┐ │ ┌───────────────────────────┐││
│ │ │ [AI] Lead Enrichment     │ │ │       (Agent Graph)       │││
│ │ │ Enriched: Acme Corp      │ │ │                           │││
│ │ │ Confidence: 92% ●●●●○    │ │ │    ┌─────┐               │││
│ │ │ 2:34 PM  [View Reasoning]│ │ │    │Lead │               │││
│ │ └──────────────────────────┘ │ │    │Agent│──▶[Enrich]    │││
│ │ ┌──────────────────────────┐ │ │    └─────┘      │         │││
│ │ │ [AI] Company Research    │ │ │                 ▼         │││
│ │ │ Found 8 signals for XYZ  │ │ │            [Verify]       │││
│ │ │ Confidence: 88% ●●●●○    │ │ │                           │││
│ │ │ 2:33 PM  [View Reasoning]│ │ │                           │││
│ │ └──────────────────────────┘ │ │                           │││
│ │ ┌──────────────────────────┐ │ └───────────────────────────┘││
│ │ │ [AI] Data Validation     │ │                              ││
│ │ │ Verified 12 email addrs  │ │                              ││
│ │ │ Confidence: 95% ●●●●●    │ │                              ││
│ │ │ 2:32 PM  [View Reasoning]│ │                              ││
│ │ └──────────────────────────┘ │                              ││
│ │         ... (scrollable)      │                              ││
│ └──────────────────────────────┴───────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Visual Design System

### Color Palette (Agent Types)
Leveraging Sprint 48 design tokens + new agent-specific colors:

| Agent Type | Primary Color | Hex Code | Use Case |
|-----------|---------------|----------|----------|
| Lead Enrichment | Blue | `#3B82F6` | Lead generation, enrichment |
| Company Research | Purple | `#8B5CF6` | Data gathering, analysis |
| Data Validation | Green | `#10B981` | Verification, quality checks |
| Outreach | Orange | `#F97316` | Email generation, scheduling |
| System | Gray | `#6B7280` | Internal processes |

### Confidence Score Colors
| Range | Color | Hex Code | Badge Label |
|-------|-------|----------|-------------|
| 90-100% | Green | `#10B981` | Excellent |
| 70-89% | Blue | `#3B82F6` | Good |
| 50-69% | Yellow | `#F59E0B` | Fair |
| 0-49% | Red | `#EF4444` | Low |

### Icons (using Heroicons or Lucide React)
| Element | Icon | Purpose |
|---------|------|---------|
| Lead Agent | UserIcon | Represents lead-related actions |
| Research Agent | MagnifyingGlassIcon | Data discovery |
| Validation Agent | CheckCircleIcon | Data verification |
| Collaboration | ArrowsRightLeftIcon | Agent handoffs |
| Reasoning | LightBulbIcon | Decision explanations |
| Confidence | ChartBarIcon | Score indicators |
| Time | ClockIcon | Timestamps |
| Live Status | SignalIcon | Real-time indicator |

---

## 🧱 Component Specifications

### 1. ActivityFeed Component
```typescript
/**
 * Main activity feed showing real-time agent events
 * @component ActivityFeed
 */
interface ActivityFeedProps {
  /** Array of agent events to display */
  events: AgentEvent[];
  /** Whether feed is in live mode (auto-scrolling) */
  isLive: boolean;
  /** Callback to pause live updates */
  onPause: () => void;
  /** Callback to resume live updates */
  onResume: () => void;
  /** Callback when user clicks an event */
  onSelectEvent: (eventId: string) => void;
}

/**
 * Single agent event data structure
 */
interface AgentEvent {
  id: string;
  agentType: 'lead' | 'research' | 'validation' | 'outreach' | 'system';
  action: string; // "Enriched lead", "Found signals", etc.
  target: string; // "Acme Corp", "John Doe", etc.
  confidence: number; // 0-100
  timestamp: Date;
  reasoning?: string; // Optional detailed explanation
  outcome: 'success' | 'failure' | 'in_progress';
}
```

**Visual Design:**
- Card-based feed with vertical scroll
- Auto-scroll when live, pause button at top
- Each card shows:
  - Agent type badge (colored)
  - Action description (bold)
  - Target entity (link if applicable)
  - Confidence score (visual indicator + %)
  - Timestamp (relative: "2m ago")
  - "View Reasoning" button (expands or opens modal)
- Glassmorphism effect from Sprint 48
- Smooth animations (fade-in for new events)

---

### 2. DecisionCard Component
```typescript
/**
 * Individual card displaying a single agent decision
 * @component DecisionCard
 */
interface DecisionCardProps {
  /** Agent event data to display */
  event: AgentEvent;
  /** Callback when card is clicked */
  onClick: () => void;
  /** Whether card shows expanded reasoning */
  isExpanded?: boolean;
}
```

**Visual Design:**
- Compact card (default state):
  - Agent icon + type badge
  - Action + target (2 lines max)
  - Confidence indicator (5 circles, filled based on score)
  - Timestamp
  - Hover effect (lift + shadow)
- Expanded card (modal or inline):
  - Full reasoning text
  - Data sources used
  - Alternative options considered
  - Confidence breakdown
  - Related actions (timeline)

---

### 3. ConfidenceIndicator Component
```typescript
/**
 * Visual indicator for agent confidence scores
 * @component ConfidenceIndicator
 */
interface ConfidenceIndicatorProps {
  /** Confidence score (0-100) */
  score: number;
  /** Visual size variant */
  size: 'sm' | 'md' | 'lg';
  /** Whether to show text label */
  showLabel?: boolean;
  /** Whether to show tooltip on hover */
  showTooltip?: boolean;
}
```

**Visual Design:**
- **Option 1: Circular Progress** (like Sprint 49 quality indicators)
  - SVG circle with stroke progress
  - Percentage in center
  - Color changes based on score
- **Option 2: Dots/Circles** (5 dots, filled based on score)
  - 90-100%: 5 dots filled
  - 70-89%: 4 dots filled
  - 50-69%: 3 dots filled
  - etc.
- **Option 3: Badge** (text + color)
  - "Excellent (92%)" in green badge
- **Recommendation:** Use **Option 2 (Dots)** in feed, **Option 1 (Circular)** in dashboard

---

### 4. CollaborationGraph Component
```typescript
interface CollaborationGraphProps {
  agentActivities: AgentEvent[];
  onNodeClick: (agentType: string) => void;
}

interface AgentNode {
  id: string;
  type: 'lead' | 'research' | 'validation' | 'outreach';
  activeNow: boolean;
  actionCount: number; // last 1 hour
}

interface AgentEdge {
  from: string; // agent type
  to: string; // agent type
  handoffs: number; // count of data passed
}
```

**Visual Design:**
- Network graph with nodes (agents) and edges (handoffs)
- Node design:
  - Circle with agent icon
  - Color by agent type
  - Pulse animation if active now
  - Badge with action count
- Edge design:
  - Animated dashed line (direction arrow)
  - Thickness based on handoff count
  - Color inherits from source agent
- Zoom/pan controls
- Click node to filter feed to that agent type

---

### 5. PerformanceDashboard Component
```typescript
interface PerformanceDashboardProps {
  metrics: AgentMetrics;
  timeRange: '1h' | '24h' | '7d' | '30d';
  onTimeRangeChange: (range: string) => void;
}

interface AgentMetrics {
  actionsPerHour: number;
  successRate: number; // 0-100
  avgConfidence: number; // 0-100
  activeAgents: number;
  topPerformers: Array<{
    agentType: string;
    successRate: number;
  }>;
}
```

**Visual Design:**
- Horizontal card grid (4 metrics)
- Each metric card:
  - Large number (primary metric)
  - Label below
  - Trend indicator (↑ 12% vs last period)
  - Colored border (agent type color)
- Time range selector at top-right
- Mini chart (sparkline) showing trend over time

---

### 6. FilterBar Component
```typescript
interface FilterBarProps {
  filters: AgentFilters;
  onFilterChange: (filters: AgentFilters) => void;
  onClear: () => void;
}

interface AgentFilters {
  agentTypes: string[]; // ['lead', 'research']
  timeRange: '1h' | '24h' | '7d' | 'all';
  confidenceMin: number; // 0-100
  outcome: 'success' | 'failure' | 'all';
  searchQuery: string;
}
```

**Visual Design:**
- Horizontal bar with dropdowns and search
- Dropdowns:
  - Agent Type: Multi-select with checkboxes
  - Time Range: Single-select
  - Confidence: Slider (0-100%)
  - Outcome: Single-select (Success/Failure/All)
- Search input: Searches reasoning text
- "Clear All" button at right
- Active filter count badge

---

## 🌗 Dark Mode Support

Following Sprint 48 standards:
- Background: Dark gray (`#1F2937`)
- Cards: Glassmorphism with `backdrop-blur-md`
- Text: White/Gray scale for contrast
- Borders: Subtle gray borders (`border-gray-700`)
- Confidence colors: Same palette (already high contrast)

---

## 📱 Responsive Design

### Mobile Layout (375px - 768px)
- Stack activity feed and collaboration graph vertically
- Performance dashboard: 2x2 grid instead of 1x4
- Filter bar: Collapsible accordion
- Activity cards: Full width, simplified info

### Tablet Layout (768px - 1024px)
- Performance dashboard: 2x2 or 4x1 depending on space
- Activity feed + collaboration graph: 50/50 split or stacked

---

## ✨ Animations & Interactions

Using Framer Motion (already in project from Sprint 48):

| Element | Animation | Trigger |
|---------|-----------|---------|
| New event in feed | Fade in + slide down | WebSocket receives event |
| Card hover | Lift + shadow increase | Mouse hover |
| Confidence indicator | Count up animation | Initial render |
| Collaboration graph | Pulse on active nodes | Every 2 seconds |
| Filter badge | Scale in | Filter applied |
| Modal | Fade + scale in | Click "View Reasoning" |

---

## 🔗 Integration Points

### API Endpoints (Feature #6 - Backend)
```typescript
// WebSocket connection
ws://api.upr.com/agents/activity/stream

// Event schema
{
  "event_id": "evt_123",
  "agent_type": "lead",
  "action": "enriched_lead",
  "target": {
    "type": "company",
    "id": "comp_456",
    "name": "Acme Corp"
  },
  "confidence": 92,
  "reasoning": "Found 8 verified data points from LinkedIn...",
  "timestamp": "2025-11-21T14:34:22Z",
  "outcome": "success"
}

// REST endpoints for historical data
GET /api/agents/activity?limit=50&offset=0
GET /api/agents/metrics?timeRange=24h
GET /api/agents/collaboration?timeRange=24h
```

### State Management
- Use **React Context** for filter state (shared across components)
- Use **Zustand** if performance issues (many events)
- Local state for expanded cards, hover states

---

## ♿ Accessibility (WCAG 2.1 AA Compliance)

### ARIA Labels & Semantic HTML
All interactive elements must include proper ARIA attributes:

```typescript
// Example: FilterBar dropdown
<button
  role="button"
  aria-label="Filter by agent type"
  aria-expanded={isOpen}
  aria-haspopup="listbox"
  onClick={toggleDropdown}
>
  Agent Type ▼
</button>

// Example: Activity feed
<div
  role="feed"
  aria-label="Real-time agent activity feed"
  aria-live="polite"
  aria-busy={isLoading}
>
  {events.map(event => (
    <article
      key={event.id}
      role="article"
      aria-labelledby={`event-${event.id}-title`}
    >
      {/* Event content */}
    </article>
  ))}
</div>

// Example: Pause/Resume button
<button
  aria-label={isLive ? "Pause live updates" : "Resume live updates"}
  aria-pressed={!isLive}
>
  {isLive ? "Pause" : "Resume"}
</button>
```

### Keyboard Navigation
All interactive elements must be keyboard accessible:

| Element | Keyboard Action | Behavior |
|---------|----------------|----------|
| FilterBar dropdowns | `Tab` to focus, `Enter/Space` to open, `Arrow keys` to navigate | Opens dropdown menu |
| Activity cards | `Tab` to focus, `Enter` to expand | Shows full reasoning |
| Pause/Resume button | `Tab` to focus, `Space` to toggle | Pauses/resumes feed |
| Modal | `Tab` to cycle focus, `Esc` to close | Closes modal, returns focus |
| Search input | `Tab` to focus, `Esc` to clear | Clears search query |

**Focus Management:**
- Visible focus indicators (2px blue outline) on all interactive elements
- Focus trap in modals (prevent tabbing outside modal)
- Return focus to trigger element when modal closes
- Skip links for keyboard users: "Skip to activity feed"

### Color Contrast Ratios
Verify all text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text):

| Element | Background | Foreground | Contrast Ratio | Status |
|---------|-----------|------------|----------------|--------|
| Body text on dark bg | `#1F2937` | `#F9FAFB` | 15.8:1 | ✅ Pass |
| Glass card text | `rgba(255,255,255,0.1)` | `#F9FAFB` | 4.8:1 | ✅ Pass |
| Confidence badges | Various | White | Min 4.5:1 | ⚠️ Verify |
| Agent type badges | Agent colors | White | Min 4.5:1 | ⚠️ Verify |

**Action Required:** Test glassmorphism backgrounds with contrast checker tool. If contrast falls below 4.5:1, add a darker overlay (`rgba(0,0,0,0.3)`) behind text.

### Screen-Reader Support
- **Live Region for Feed:** Use `aria-live="polite"` on ActivityFeed so new events are announced
- **Reasoning Expansion:** Wrap reasoning text in `aria-expanded` region that's announced when opened
- **Visual-only indicators:** Add `sr-only` text for confidence dots (e.g., "Confidence: 92% - Excellent")
- **Image alt text:** All icons must have descriptive labels (not just "icon")

**Example:**
```typescript
// Confidence indicator with screen-reader text
<div aria-label={`Confidence score: ${score}% - ${getScoreLabel(score)}`}>
  <span aria-hidden="true">●●●●○</span>
  <span className="sr-only">
    {score}% confidence - {getScoreLabel(score)}
  </span>
</div>
```

---

## ⚡ Performance Optimizations

### Virtualized Activity Feed (react-window)
For high-volume event streams (100+ events), implement virtual scrolling:

```typescript
import { VariableSizeList as List } from 'react-window';

<List
  height={600}
  itemCount={events.length}
  itemSize={(index) => events[index].hasReasoning ? 150 : 100}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <DecisionCard event={events[index]} />
    </div>
  )}
</List>
```

**Benefits:**
- Render only visible rows (~10-15 cards)
- Handle 1000+ events without lag
- Maintain 60fps scrolling

**Trigger:** Enable virtualization when `events.length > 50`

### WebSocket Reconnection Strategy
Implement exponential backoff for WebSocket disconnections:

```typescript
const reconnectWebSocket = (attempt: number = 0) => {
  const maxAttempts = 5;
  const baseDelay = 1000; // 1 second

  if (attempt >= maxAttempts) {
    console.error('Max reconnection attempts reached');
    showErrorToast('Lost connection to server');
    return;
  }

  const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30s

  setTimeout(() => {
    console.log(`Reconnecting... (attempt ${attempt + 1}/${maxAttempts})`);
    connectWebSocket()
      .catch(() => reconnectWebSocket(attempt + 1));
  }, delay);
};
```

**Reconnection UI:**
- Show "Reconnecting..." banner at top of feed
- Display countdown timer for next attempt
- Option to "Retry Now" button

### Lazy-Load Collaboration Graph
Only load graph library (D3.js/Recharts) when user first interacts with graph:

```typescript
const CollaborationGraph = lazy(() => import('./CollaborationGraph'));

// In parent component
const [showGraph, setShowGraph] = useState(false);

{showGraph ? (
  <Suspense fallback={<GraphSkeleton />}>
    <CollaborationGraph />
  </Suspense>
) : (
  <button onClick={() => setShowGraph(true)}>
    Show Collaboration Graph
  </button>
)}
```

**Trigger:** Load graph after first 10 events received OR when user clicks graph tab

### Rate-Limiting UI Updates
Throttle feed updates to prevent browser overload:

```typescript
import { throttle } from 'lodash-es';

const updateFeed = throttle((newEvents: AgentEvent[]) => {
  setEvents(prevEvents => [...prevEvents, ...newEvents]);
}, 200); // Max 5 updates/second
```

**Batching Strategy:**
- Collect events in a buffer
- Flush buffer every 200ms
- Show "X new events" badge if paused

---

## 🧪 Testing & Quality Assurance

### Component Unit Tests (Vitest)
Required test cases for each component:

#### ActivityFeed Component
```typescript
describe('ActivityFeed', () => {
  it('renders empty state when no events', () => {});
  it('renders event cards correctly', () => {});
  it('auto-scrolls to bottom when in live mode', () => {});
  it('pauses auto-scroll when user manually scrolls', () => {});
  it('calls onSelectEvent when card is clicked', () => {});
  it('shows "X new events" badge when paused', () => {});
});
```

#### DecisionCard Component
```typescript
describe('DecisionCard', () => {
  it('renders compact card with agent badge', () => {});
  it('displays correct confidence color based on score', () => {});
  it('expands to show reasoning when clicked', () => {});
  it('shows "View Reasoning" button only if reasoning exists', () => {});
  it('formats timestamp as relative time', () => {});
});
```

#### ConfidenceIndicator Component
```typescript
describe('ConfidenceIndicator', () => {
  it('renders correct number of filled dots based on score', () => {});
  it('applies correct color class (green/blue/yellow/red)', () => {});
  it('shows tooltip on hover if enabled', () => {});
  it('displays percentage label if showLabel=true', () => {});
  it('meets WCAG contrast requirements', () => {});
});
```

#### FilterBar Component
```typescript
describe('FilterBar', () => {
  it('updates URL query params when filters change', () => {});
  it('shows active filter count badge', () => {});
  it('clears all filters when "Clear" clicked', () => {});
  it('multi-select agent types work correctly', () => {});
  it('debounces search input (300ms)', () => {});
});
```

### Integration Tests (Playwright)
End-to-end scenarios:

```typescript
test('Live feed updates in real-time', async ({ page }) => {
  await page.goto('/siva');

  // Wait for WebSocket connection
  await page.waitForSelector('[aria-label="Real-time agent activity feed"]');

  // Verify initial events load
  const initialCount = await page.locator('article[role="article"]').count();
  expect(initialCount).toBeGreaterThan(0);

  // Wait for new event (simulate WebSocket message)
  await page.waitForTimeout(2000);
  const newCount = await page.locator('article[role="article"]').count();
  expect(newCount).toBeGreaterThan(initialCount);
});

test('Filter and search workflow', async ({ page }) => {
  await page.goto('/siva');

  // Apply agent type filter
  await page.click('button:has-text("Agent Type")');
  await page.click('text=Lead Enrichment');

  // Verify feed updates
  const badges = await page.locator('[data-agent-type="lead"]').count();
  expect(badges).toBeGreaterThan(0);

  // Search in reasoning
  await page.fill('input[placeholder*="Search"]', 'LinkedIn');
  await page.waitForTimeout(500); // Debounce

  // Verify search results
  const results = await page.locator('article:has-text("LinkedIn")').count();
  expect(results).toBeGreaterThan(0);
});

test('Modal opens and closes correctly', async ({ page }) => {
  await page.goto('/siva');

  // Click "View Reasoning" button
  await page.click('button:has-text("View Reasoning")').first();

  // Verify modal opens
  await page.waitForSelector('[role="dialog"]');

  // Close with Escape key
  await page.keyboard.press('Escape');

  // Verify modal closes
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
});
```

### Visual Regression Tests (Storybook + Chromatic)
Create Storybook stories for all components:

```typescript
// DecisionCard.stories.tsx
export default {
  title: 'SIVA/DecisionCard',
  component: DecisionCard,
};

export const Default = () => (
  <DecisionCard event={mockEvent} onClick={() => {}} />
);

export const HighConfidence = () => (
  <DecisionCard event={{ ...mockEvent, confidence: 95 }} onClick={() => {}} />
);

export const LowConfidence = () => (
  <DecisionCard event={{ ...mockEvent, confidence: 45 }} onClick={() => {}} />
);

export const DarkMode = () => (
  <div className="dark">
    <DecisionCard event={mockEvent} onClick={() => {}} />
  </div>
);
```

**Chromatic Integration:**
- Take snapshots of all component states
- Catch unintended CSS changes
- Review visual diffs before merging

---

## 🌍 Internationalization (i18n)

### String Externalization
All UI text must be extracted to localization files:

**File Structure:**
```
dashboard/src/locales/
├── en.json    (English - Primary)
├── ar.json    (Arabic - UAE market)
└── index.ts   (Type-safe i18n hook)
```

**Example: en.json**
```json
{
  "siva": {
    "page_title": "AI Agents in Action",
    "page_subtitle": "Real-time agent activity and reasoning",
    "live_indicator": "Live",
    "pause_button": "Pause",
    "resume_button": "Resume",
    "view_reasoning": "View Reasoning",
    "clear_filters": "Clear All",
    "agent_types": {
      "lead": "Lead Enrichment",
      "research": "Company Research",
      "validation": "Data Validation",
      "outreach": "Outreach",
      "system": "System"
    },
    "confidence_labels": {
      "excellent": "Excellent",
      "good": "Good",
      "fair": "Fair",
      "low": "Low"
    }
  }
}
```

**Example: ar.json**
```json
{
  "siva": {
    "page_title": "وكلاء الذكاء الاصطناعي في العمل",
    "page_subtitle": "نشاط الوكيل في الوقت الفعلي والتفكير",
    "live_indicator": "مباشر",
    "pause_button": "إيقاف مؤقت",
    "resume_button": "استئناف"
  }
}
```

**Usage in Components:**
```typescript
import { useTranslation } from '@/hooks/useTranslation';

function ActivityFeed() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('siva.page_title')}</h1>
      <button>{t('siva.pause_button')}</button>
    </div>
  );
}
```

**RTL Support (Arabic):**
- Detect language and apply `dir="rtl"` to root element
- Mirror layouts using Tailwind's `rtl:` variants
- Flip animations/transitions appropriately

---

## 🔒 Security & Privacy

### PII Redaction Rules
Agent reasoning may contain sensitive data. Apply redaction before sending to frontend:

**Backend Redaction (Feature #6 API):**
```typescript
const redactSensitiveData = (reasoning: string): string => {
  return reasoning
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****') // SSN
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]') // Email
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]') // Credit card
    .replace(/\b\+?\d{10,15}\b/g, '[phone]'); // Phone numbers
};
```

**Fields to Redact:**
- Employee names (unless public figures)
- Email addresses
- Phone numbers
- Credit card numbers
- SSN/Tax IDs
- Internal system IDs

**UI Indication:**
Show redaction badge: `🔒 Some data redacted for privacy`

### Rate-Limiting API Calls
Prevent abuse of WebSocket/REST endpoints:

**Frontend Throttling:**
- Max 5 UI updates per second (already covered in Performance)
- Debounce search input (300ms)
- Throttle filter changes (500ms)

**Backend Rate Limits:**
- WebSocket: 100 events/minute per user
- REST API: 60 requests/minute per user
- Return `429 Too Many Requests` if exceeded

---

## 📚 Documentation Enhancements

### Glossary of Terms
Add to end of this spec:

| Term | Definition |
|------|------------|
| **Agent** | An autonomous AI system that performs specific tasks (e.g., Lead Enrichment, Data Validation) |
| **Confidence Score** | Numeric indicator (0-100%) representing an agent's certainty in its decision |
| **Reasoning** | Textual explanation of why an agent made a specific decision, including data sources and logic |
| **Collaboration Graph** | Visual network showing how agents pass data to each other (handoffs) |
| **SIVA** | "System Intelligence & Visualization Architecture" - the agent monitoring dashboard |
| **Activity Feed** | Real-time stream of agent actions, decisions, and outcomes |
| **Handoff** | When one agent passes data/context to another agent for further processing |
| **Outcome** | Result of an agent action: success, failure, or in_progress |

### Quick Links
- **Sprint 48 Design System:** [docs/sprints/SPRINT_48_HANDOFF.md](./SPRINT_48_HANDOFF.md)
- **Technical Architecture:** [docs/architecture/TECHNICAL_ARCHITECTURE.md](../architecture/TECHNICAL_ARCHITECTURE.md)
- **API Documentation:** TBD (will be created in Feature #6 - Backend)
- **Storybook:** TBD (will be deployed after Phase 3)
- **Figma Designs:** N/A (Tailwind-first approach, no Figma needed)

### Version History
- **v1.0** (2025-11-21): Initial design spec with component architecture
- **v2.0** (2025-11-21): Enterprise-grade additions (accessibility, performance, testing, i18n, security)

---

## 🎯 Design Goals Checklist

### Core Design
- [x] Clear visual hierarchy (dashboard → feed → details)
- [x] Agent types easily distinguishable (color + icons)
- [x] Confidence scores intuitive (dots/circles)
- [x] Real-time feel (animations, live indicator)
- [x] Sprint 48 design system consistency
- [x] Dark mode support
- [x] Responsive (mobile, tablet, desktop)

### Enterprise-Grade Requirements
- [x] **Accessibility:** WCAG 2.1 AA compliant (ARIA labels, keyboard nav, screen-reader support)
- [x] **Performance:** Virtualized feed, lazy-loading, WebSocket reconnection, rate-limiting
- [x] **Testing:** Unit tests (Vitest), E2E tests (Playwright), Visual regression (Storybook)
- [x] **i18n:** Externalized strings for English + Arabic with RTL support
- [x] **Security:** PII redaction, rate-limiting, thin client architecture
- [x] **Documentation:** Glossary, version history, quick links, JSDoc comments

---

## 📊 User Flow

### Primary User Journey
1. User lands on SIVA page
2. Sees performance dashboard (high-level metrics)
3. Scans activity feed (recent agent actions)
4. Clicks "View Reasoning" on interesting event
5. Reads detailed explanation in modal
6. Applies filters to focus on specific agent type
7. Observes collaboration graph to understand workflow

### Developer Journey (Internal)
1. Open SIVA page to debug agent behavior
2. Filter to specific time range (e.g., last incident)
3. Search for keyword in reasoning ("failed", "timeout")
4. Identify problematic agent
5. Review decision cards to understand root cause
6. Check performance dashboard for trends

---

## 🚀 Next Steps

### Phase 1: Design (Complete)
1. ✅ Design spec v1.0 complete
2. ✅ Stakeholder review and feedback incorporated
3. ✅ Design spec v2.0 with enterprise-grade requirements

### Phase 2: Backend API (Feature #6)
4. ⏭️ Create TypeScript interfaces (dashboard/src/types/agent.ts)
5. ⏭️ Build WebSocket streaming API (api/routes/agents/activity.ts)
6. ⏭️ Build mock data generator for development
7. ⏭️ Document API endpoints and event schema
8. ⏭️ **Checkpoint:** API returns mock agent events in real-time

### Phase 3: Core Frontend Components
9. ⏭️ Implement ActivityFeed with virtualization
10. ⏭️ Implement DecisionCard with accessibility features
11. ⏭️ Implement ConfidenceIndicator with screen-reader support
12. ⏭️ **Checkpoint:** Components render with mock data

---

## 📋 Implementation Priorities

Based on feedback, the following are **critical path** items:

### Sprint 51 (High Priority)
- ✅ ARIA attributes & keyboard navigation (Accessibility)
- ✅ Virtualized ActivityFeed (Performance)
- ✅ Unit tests for all components (Testing)
- ✅ PII redaction rules (Security)
- ✅ Glossary & version header (Documentation)
- ✅ Link to Sprint 48 design system (Documentation)

### Sprint 52 (Medium Priority)
- ⏭️ i18n extraction plan & en.json creation (i18n)
- ⏭️ Arabic translations & RTL support (i18n)
- ⏭️ Visual regression tests with Storybook (Testing)

---

**Design Status:** ✅ APPROVED (v2.0 - Enterprise-Grade)
**Next Action:** Proceed to Phase 2 - Build Backend Streaming API (Feature #6)
**Stakeholder Sign-Off:** SKC (2025-11-21)
