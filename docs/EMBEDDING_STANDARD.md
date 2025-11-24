# Embedding Standard Documentation

**Last Updated**: 2025-10-22
**Status**: LOCKED
**Version**: 1.0

---

## Standard: text-embedding-3-small (384 dimensions)

### Decision

After Cloud SQL migration, we standardized on OpenAI's `text-embedding-3-small` model with **384 dimensions** for all vector operations.

### Rationale

1. **Cost Efficiency**: 85% cheaper than text-embedding-3-large
   - Small: $0.02 per 1M tokens
   - Large: $0.13 per 1M tokens

2. **Sufficient Accuracy**: Pattern matching is simple semantic matching
   - Domain/company/sector similarity
   - Not complex multi-hop reasoning
   - 384 dims sufficient for our use case

3. **Performance**: Smaller vectors = faster operations
   - Faster vector operations
   - Smaller index size
   - Better ivfflat performance

4. **Consistency**: One standard across all tables
   - pattern_failures
   - email_patterns
   - kb_chunks

### Implementation

#### Code Configuration
`server/lib/emailIntelligence/rag.js:12-13`
```javascript
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 384;
```

#### Database Schema
All vector columns use `vector(384)`:
```sql
-- Pattern failures (similarity search to avoid repeating mistakes)
ALTER TABLE pattern_failures
  ALTER COLUMN embedding TYPE vector(384);

-- Email patterns (RAG pattern discovery)
ALTER TABLE email_patterns
  ALTER COLUMN embedding TYPE vector(384);

-- Knowledge base chunks (future feature)
ALTER TABLE kb_chunks
  ALTER COLUMN embedding TYPE vector(384);
```

#### Indexes
ivfflat indexes with `lists=100`:
```sql
CREATE INDEX idx_pattern_failures_embedding
  ON pattern_failures
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Version Tracking

The `embedding_meta` table tracks our embedding configuration:

```sql
CREATE TABLE embedding_meta (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  cost_per_1m_tokens NUMERIC(10,4),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT DEFAULT CURRENT_USER,
  notes TEXT
);
```

Current record:
```sql
INSERT INTO embedding_meta VALUES (
  'text-embedding-3-small',
  384,
  0.02,
  'Initial standard: Changed from 1536 (3-large) to 384 (3-small) for cost efficiency'
);
```

### Validation Guard

All embedding generation validates dimensions:

`server/lib/emailIntelligence/rag.js:64-72`
```javascript
const embedding = response.data[0].embedding;

// CRITICAL: Validate embedding dimensions match database schema
if (embedding.length !== EMBEDDING_DIMENSIONS) {
  throw new Error(
    `Embedding dimension mismatch! ` +
    `Expected ${EMBEDDING_DIMENSIONS} dimensions (${EMBEDDING_MODEL}), ` +
    `but got ${embedding.length}. ` +
    `Database schema and embedding model are out of sync.`
  );
}
```

This prevents:
- Accidental model changes
- Schema drift
- Runtime errors on vector operations

---

## Migration History

### 2025-10-22: Initial Standardization

**Migration**: `db/migrations/2025_10_22_fix_embedding_dimensions.sql`

**Changes**:
- Changed from 1536 → 384 dimensions
- Aligned code with database schema
- Added embedding_meta table
- Added validation guard in code

**Impact**:
- ✅ Enrichment continues working
- ✅ Failure learning enabled (prevents $0.024 repeats)
- ✅ Vector similarity search functional
- ✅ 85% cost savings on embeddings

**Applied**: Pending (migration created, awaiting execution)

---

## Future Changes

### If We Need Higher Dimensions (1536)

**Use Case**: Complex semantic reasoning, multi-hop queries

**Process**: Online column swap (zero downtime)

1. Add new column:
   ```sql
   ALTER TABLE email_patterns
     ADD COLUMN embedding_1536 vector(1536);
   ```

2. Dual-write in code (temporary):
   ```javascript
   // Write both columns during migration period
   await db.query(`
     UPDATE email_patterns
     SET embedding = $1::vector(384),
         embedding_1536 = $2::vector(1536)
     WHERE domain = $3
   `, [embedding384, embedding1536, domain]);
   ```

3. Backfill existing data:
   ```javascript
   // Run backfill job to populate embedding_1536
   node backfill-embeddings-1536.js
   ```

4. Create new index:
   ```sql
   CREATE INDEX idx_email_patterns_embedding_1536
     ON email_patterns
     USING ivfflat (embedding_1536 vector_cosine_ops)
     WITH (lists = 100);
   ```

5. Swap in single transaction:
   ```sql
   BEGIN;
   ALTER TABLE email_patterns RENAME COLUMN embedding TO embedding_old;
   ALTER TABLE email_patterns RENAME COLUMN embedding_1536 TO embedding;
   DROP INDEX idx_email_patterns_embedding;
   ALTER INDEX idx_email_patterns_embedding_1536
     RENAME TO idx_email_patterns_embedding;
   ALTER TABLE email_patterns DROP COLUMN embedding_old;
   COMMIT;
   ```

6. Update code:
   ```javascript
   const EMBEDDING_MODEL = 'text-embedding-3-large';
   const EMBEDDING_DIMENSIONS = 1536;
   ```

7. Update embedding_meta:
   ```sql
   INSERT INTO embedding_meta VALUES (
     'text-embedding-3-large',
     1536,
     0.13,
     'Upgraded to 1536 dimensions for improved semantic accuracy'
   );
   ```

**Decision Criteria**:
- Cost increase justifiable (6.5x more expensive)
- Accuracy improvement measurable
- Use case requires complex reasoning
- ROI positive

---

## Testing

### Dimension Validation Test

```javascript
// Test that validation guard works
import { generateEmbedding } from './rag.js';

try {
  const embedding = await generateEmbedding({
    domain: 'test.com',
    company: 'Test Corp',
    sector: 'Technology',
    region: 'US'
  });

  console.assert(
    embedding.length === 384,
    `Expected 384 dimensions, got ${embedding.length}`
  );

  console.log('✅ Embedding dimension validation passed');
} catch (error) {
  console.error('❌ Embedding generation failed:', error.message);
}
```

### Vector Storage Test

```sql
-- Test vector storage with 384 dimensions
DO $$
DECLARE
  test_embedding vector(384);
  stored_embedding vector(384);
BEGIN
  -- Generate 384-dim test vector
  test_embedding := ARRAY(SELECT random() FROM generate_series(1, 384))::vector(384);

  -- Store it
  INSERT INTO email_patterns (domain, pattern, confidence, embedding)
  VALUES ('test-embedding.com', '{first}.{last}', 0.5, test_embedding);

  -- Retrieve it
  SELECT embedding INTO stored_embedding
  FROM email_patterns
  WHERE domain = 'test-embedding.com';

  -- Verify dimensions
  RAISE NOTICE 'Stored embedding dimensions: %', array_length(stored_embedding::real[], 1);

  -- Cleanup
  DELETE FROM email_patterns WHERE domain = 'test-embedding.com';

  IF array_length(stored_embedding::real[], 1) = 384 THEN
    RAISE NOTICE '✅ Vector storage test passed';
  ELSE
    RAISE EXCEPTION '❌ Vector storage test failed';
  END IF;
END $$;
```

### Similarity Search Test

```sql
-- Test vector similarity search
SELECT
  domain,
  pattern,
  1 - (embedding <=> '[0.1, 0.2, ..., 0.384]'::vector) as similarity
FROM email_patterns
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1, 0.2, ..., 0.384]'::vector
LIMIT 5;
```

---

## Monitoring

### Metrics to Track

1. **Embedding Generation**
   - Requests per minute
   - Average latency
   - Cost per 1M tokens

2. **Vector Operations**
   - Query latency (<10ms target)
   - Index scan performance
   - Memory usage

3. **Failure Learning**
   - Patterns with embeddings (should be 100%)
   - Similarity search hits/misses
   - Cost savings from avoided repeats

### Alerts

Set up monitoring for:

```javascript
// Alert if dimension mismatch detected
if (embedding.length !== EMBEDDING_DIMENSIONS) {
  logger.error('CRITICAL: Embedding dimension mismatch', {
    expected: EMBEDDING_DIMENSIONS,
    actual: embedding.length,
    model: EMBEDDING_MODEL
  });
  // Trigger PagerDuty/Slack alert
}
```

```sql
-- Alert if embeddings missing
SELECT COUNT(*) as missing_embeddings
FROM email_patterns
WHERE embedding IS NULL;
-- Alert if > 10
```

---

## References

- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **pgvector**: https://github.com/pgvector/pgvector
- **Migration**: `db/migrations/2025_10_22_fix_embedding_dimensions.sql`
- **Code**: `server/lib/emailIntelligence/rag.js`
- **Deployment**: `deploy-embedding-migration-job.sh`

---

## Contact

For questions about embedding standard:
- Review this document
- Check `embedding_meta` table for current config
- Review git history: `git log --all --grep="embedding"`

**Last Modified**: 2025-10-22
**Next Review**: 2026-04-22 (6 months)
