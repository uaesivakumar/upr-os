# EmailPatternEngine v3.0.0

**Proprietary Bayesian inference system for corporate email pattern discovery.**

> *"The Email Pattern Engine That Learns Forever"*

---

## Quick Start

```javascript
import { learnPattern } from './orchestrator.js';

const result = await learnPattern({
  company: 'Emirates NBD',
  domain: 'emiratesnbd.com',
  sector: 'Banking',
  region: 'UAE',
  company_size: 'Large',
  leads: [
    { first_name: 'Ahmed', last_name: 'Ali', title: 'VP Engineering' },
    { first_name: 'Fatima', last_name: 'Hassan', title: 'Senior Developer' }
  ]
});

console.log(result);
// {
//   pattern: '{first}{l}',
//   confidence: 0.89,
//   validated_emails: ['ahmedA@emiratesnbd.com', 'fatimaH@emiratesnbd.com'],
//   cost: 0.0024,
//   latency: 1847
// }
```

---

## Architecture

```
RAG → Evidence Aggregation → LLM (gated) → NeverBounce → Store
 ↓           ↓                    ↓            ↓          ↓
Exact    Bayesian            Uncertainty   Validate   Learn
Match    Posterior             Gates       Pattern   Forever
```

**Key Innovations:**
- **Never fails** - Always returns a prediction (global prior at worst)
- **Self-improving** - Learns from every validated pattern
- **Cost-optimized** - 60-70% LLM savings, 40-50% NB savings
- **Explainable** - Full trace with evidence breakdown

---

## Modules

| File | Purpose |
|------|---------|
| `orchestrator.js` | Main entry point - coordinates all layers |
| `rules.js` | **Core engine** - Hierarchical Bayesian inference |
| `rag.js` | Vector similarity search (pgvector) |
| `prompt.js` | LLM integration (GPT-4o-mini) |
| `nb.js` | NeverBounce parallel validation |
| `nb-cache.js` | Token bucket + 24h cache |
| `confidence.js` | Confidence scoring |
| `telemetry.js` | Observability & cost tracking |
| `domainHealth.js` | MX/catch-all detection |
| `names.js` | Name normalization & diverse sampling |

---

## Configuration

All tunable parameters are exported constants:

```javascript
import { BETA, WEIGHTS, LLM_GATE } from './rules.js';

// Dirichlet prior strength
BETA = 8.0

// Evidence layer weights
WEIGHTS = {
  domain: 1.00,
  knn: 0.70,
  sector_region: 0.50,
  sector: 0.35,
  region_tld: 0.25,
  tld: 0.20
}

// LLM uncertainty gates
LLM_GATE = {
  entropy_threshold: 1.5,
  margin_threshold: 0.10,
  confidence_threshold: 0.70
}
```

---

## Performance

| Metric | Value |
|--------|-------|
| Evidence query | 2-4ms (with indexes) |
| LLM call rate | 30-40% (vs 100% always-on) |
| NB cache hit | 30-50% typical |
| Cost per 1k predictions | $12-14 (vs $24 baseline) |
| Accuracy (rich evidence) | 94% top-1 |

---

## Database Migrations

```bash
# Indexes (50-60x faster evidence queries)
psql $DATABASE_URL -f db/migrations/2025_10_21_evidence_query_indexes.sql

# NB cache + token bucket (40-50% cost savings)
psql $DATABASE_URL -f db/migrations/2025_10_21_nb_cache_and_token_bucket.sql
```

---

## Testing

```bash
# Quick test (no DB required)
node server/lib/emailIntelligence/test-bayesian.js

# Integration test (requires DB)
node server/lib/emailIntelligence/test-orchestrator.js --quick

# Full end-to-end (requires DB + OpenAI + NB)
node server/lib/emailIntelligence/test-orchestrator.js
```

---

## Documentation

- **[RELEASE_NOTES_v3.0.0.md](./RELEASE_NOTES_v3.0.0.md)** - Complete architecture & benchmarks
- **[PRODUCTION_HARDENING_SUMMARY.md](../../PRODUCTION_HARDENING_SUMMARY.md)** - Production improvements
- **[VERSION](./VERSION)** - Current version (3.0.0)

---

## Version History

### v3.0.0 (2025-10-21) - **Production Baseline**
- ✅ Hierarchical Bayesian inference
- ✅ LLM uncertainty gates
- ✅ NB token bucket + cache
- ✅ Evidence query indexes
- ✅ Full explainability trace
- ✅ Production hardening

### v2.0.0 (2025-10-20)
- RAG (pgvector) integration
- Evidence-based rules
- Week 2 Day 1-2 baseline

### v1.0.0 (2025-10-19)
- NeverBounce parallel validation
- Basic orchestration
- Week 1 baseline

---

## License

**Proprietary** - UPR (Universal People Radar)

This is a proprietary inference engine. All rights reserved.

---

## Support

For internal questions, see:
- Architecture docs: `RELEASE_NOTES_v3.0.0.md`
- Production guide: `PRODUCTION_HARDENING_SUMMARY.md`
- Code walkthrough: `test-bayesian.js`

---

**EmailPatternEngine v3.0.0** - *A learn-forever Bayesian inference core for email pattern discovery.*
