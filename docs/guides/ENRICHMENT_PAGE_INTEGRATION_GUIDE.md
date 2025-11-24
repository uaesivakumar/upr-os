# EnrichmentPage Integration Guide

## Overview
This document describes how the new 2030-grade UX components integrate with the existing EnrichmentPage.jsx.

## Key Integration Points

### 1. Imports (Add to top of file)
```javascript
// New 2030-grade UX components
import SmartContextStage from '../components/enrichment/SmartContextStage';
import NarrativeFeed from '../components/enrichment/NarrativeFeed';
import AdaptiveDrawer from '../components/enrichment/AdaptiveDrawer';
import ExplainabilityPanel from '../components/enrichment/ExplainabilityPanel';
import { useTelemetry } from '../hooks/useTelemetry';
import { getSectorTheme } from '../utils/sectorThemes';
```

### 2. State Additions (Add to existing useState hooks)
```javascript
// New state for enhanced UX
const [showExplainabilityPanel, setShowExplainabilityPanel] = useState(false);
const [showSmartContext, setShowSmartContext] = useState(false);
const { track } = useTelemetry();
```

### 3. Replace CompanyCard with SmartContextStage
**Location:** Lines 717-728 (where CompanyCard is rendered)

**Replace:**
```javascript
<CompanyCard
  company={company}
  preview={summary.preview}
  quality={summary.quality}
  summary={summary}
  onEnrich={!generationAttempted && leads.length === 0 ? handleGenerateAndEnrichLeads : null}
  isEnriching={generatingLeads}
/>
```

**With:**
```javascript
{!generationAttempted && leads.length === 0 ? (
  <SmartContextStage
    company={company}
    preview={summary.preview}
    qScore={summary.quality?.qscore?.value || 0}
    onStartEnrichment={handleGenerateAndEnrichLeads}
    isEnriching={generatingLeads}
  />
) : (
  <CompanyCard
    company={company}
    preview={summary.preview}
    quality={summary.quality}
    summary={summary}
    onEnrich={null}
    isEnriching={false}
  />
)}
```

### 4. Add NarrativeFeed During Enrichment
**Location:** After line 741 (in the leads section)

**Add:**
```javascript
{generatingLeads && (
  <NarrativeFeed
    companyName={company?.name || 'this company'}
    sector={company?.sector || company?.industry}
    isActive={true}
    onComplete={() => {
      // Enrichment complete handled by existing logic
    }}
  />
)}
```

### 5. Replace EnrichmentResultsDrawer with AdaptiveDrawer
**Location:** Lines 780-785

**Replace:**
```javascript
<EnrichmentResultsDrawer
  leads={drawerLeads}
  companyName={company?.name}
  isOpen={showResultsDrawer}
  onClose={() => setShowResultsDrawer(false)}
/>
```

**With:**
```javascript
<AdaptiveDrawer
  isOpen={showResultsDrawer}
  onClose={() => setShowResultsDrawer(false)}
  leads={drawerLeads}
  companyName={company?.name}
  onLeadSelect={(lead) => {
    // Toggle selection
    handleSelectionChange(lead.linkedin_url || lead.id, !selectedLeads.has(lead.linkedin_url || lead.id));
  }}
  selectedLeads={Array.from(selectedLeads)}
  onSaveSelected={handleSaveSelectedLeads}
  isSaving={isSaving}
/>
```

### 6. Add ExplainabilityPanel
**Location:** After line 843 (end of component, before closing div)

**Add:**
```javascript
{/* Explainability Panel */}
<ExplainabilityPanel
  isOpen={showExplainabilityPanel}
  onClose={() => setShowExplainabilityPanel(false)}
  company={company}
  summary={summary}
  enrichmentMetadata={{
    apollo_used: true,
    email_cache_hits: leads.filter(l => l.email_reason?.includes('cache')).length,
    neverbounce_calls: leads.filter(l => l.email_status === 'valid').length,
  }}
/>
```

### 7. Add "How This Was Decided" Button
**Location:** In QualityCard component (line 1022, after Q-Score display)

**Add:**
```javascript
<button
  onClick={() => setShowExplainabilityPanel(true)}
  className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
>
  📊 How This Was Decided
</button>
```

### 8. Add Telemetry Tracking
**Location:** Various interaction points

**Search and refine (handlePreviewSearch):**
```javascript
track('search_company', {
  query: queryToRun,
  mode: 'manual'
});
```

**URL refine (handleUrlRefineSubmit):**
```javascript
track('refine_url', {
  original_query: originalQuery,
  refined_url: userUrl
});
```

**Filter change (FilterBar onChange):**
```javascript
track('filter_change', {
  filter_type: 'department',
  value: opt
});
```

## Complete File Structure

```
dashboard/src/
├── pages/
│   └── EnrichmentPage.jsx (ENHANCED - orchestrates all components)
├── components/
│   └── enrichment/
│       ├── SmartContextStage.jsx (NEW)
│       ├── NarrativeFeed.jsx (NEW)
│       ├── AdaptiveDrawer.jsx (NEW)
│       ├── RoleCluster.jsx (NEW)
│       └── ExplainabilityPanel.jsx (NEW)
├── hooks/
│   └── useTelemetry.js (NEW)
└── utils/
    ├── sectorThemes.js (NEW)
    └── animations.js (NEW)
```

## Migration Strategy

### Option 1: Direct Enhancement (Recommended)
1. Backup current EnrichmentPage.jsx
2. Apply all changes in single commit
3. Test with 3 companies (Microsoft, SEHA, Chanel)
4. Deploy

### Option 2: Gradual Rollout
1. Add new components alongside old ones
2. Use feature flag to toggle between old/new UX
3. A/B test with real users
4. Gradually roll out to 100%

## Testing Checklist

- [ ] Search for company (manual mode)
- [ ] Trigger enrichment with SmartContextStage
- [ ] Verify NarrativeFeed animation during enrichment
- [ ] Check AdaptiveDrawer displays role clusters
- [ ] Confirm sector theming (blue for tech, rose for fashion, teal for healthcare)
- [ ] Test ExplainabilityPanel opens and shows data sources
- [ ] Verify telemetry events in database
- [ ] Test accessibility (keyboard navigation, reduced motion)
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Verify all existing functionality still works

## Rollback Plan

If issues occur:
```bash
git revert HEAD
git push origin feature/phase-2a-enrichment-migration --force
```

All new components are isolated - removing imports and reverting EnrichmentPage.jsx will restore original functionality.
