# Golden Dataset System - User Guide

## Overview

The Golden Dataset System is an enterprise-grade training data management platform for curating, validating, and exporting high-quality examples for machine learning model training. This guide provides comprehensive instructions for using the system.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Creating Datasets](#creating-datasets)
4. [Extracting Production Examples](#extracting-production-examples)
5. [Labeling Workflow](#labeling-workflow)
6. [Quality Management](#quality-management)
7. [Exporting Data](#exporting-data)
8. [Version Control](#version-control)
9. [Analytics and Monitoring](#analytics-and-monitoring)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- PostgreSQL database with `training` schema initialized
- Node.js environment configured
- Database connection string in `DATABASE_URL`

### Create Your First Dataset

```javascript
const { DatasetManager } = require('./server/services/datasetManager');

// Create a new dataset
const dataset = await DatasetManager.create({
  name: 'contact-tier-training',
  version: '1.0.0',
  description: 'Contact tier classification training data',
  createdBy: 'user@example.com',
  tags: ['contact_tier', 'production']
});

console.log(`Dataset created: ${dataset.id}`);
```

---

## Core Concepts

### Quality Tiers

The system uses a 4-tier quality classification:

- **Gold (90-100)**: Highest quality, production-ready examples
- **Silver (75-89)**: Good quality, minor issues acceptable
- **Bronze (60-74)**: Acceptable quality, may need review
- **Low Quality (<60)**: Requires improvement or rejection

### Quality Scoring Formula

Quality scores are calculated using 4 components:

```
Quality Score = Completeness (30pts) + Correctness (40pts) +
                Clarity (15pts) + Representativeness (15pts)
```

**Completeness (30 points)**
- All required fields present: 30 points
- Missing optional fields: deduct 5 points each

**Correctness (40 points)**
- Has feedback and positive: 40 points
- Has feedback and neutral: 30 points
- Has feedback and negative: 10 points
- No feedback: 20 points (baseline)

**Clarity (15 points)**
- Clear input/output: 15 points
- Ambiguous: 10 points
- Unclear: 5 points

**Representativeness (15 points)**
- Based on distribution coverage (calculated automatically)

### Example Types

Supported example types:
- `contact_tier`: Contact seniority classification
- `lead_score`: Lead scoring and prioritization
- `company_quality`: Company quality evaluation
- `custom`: Custom example types

### Validation Statuses

- `pending`: Awaiting validation
- `validated`: Approved for training
- `rejected`: Failed validation, excluded from training

---

## Creating Datasets

### Basic Dataset Creation

```javascript
const { DatasetManager } = require('./server/services/datasetManager');

const dataset = await DatasetManager.create({
  name: 'my-dataset',
  version: '1.0.0',
  description: 'Description of the dataset',
  createdBy: 'your-name',
  tags: ['tag1', 'tag2']
});
```

### Adding Examples Manually

```javascript
const examples = [
  {
    example_type: 'contact_tier',
    input_data: {
      title: 'VP of Engineering',
      seniority: 'executive',
      department: 'Engineering'
    },
    expected_output: {
      tier: 'A',
      confidence: 0.95
    },
    quality_score: 92,
    labels: {
      source: 'manual',
      reviewer: 'john@example.com'
    }
  }
];

await dataset.addExamples(examples);
```

### Loading Existing Dataset

```javascript
// By ID
const dataset = await DatasetManager.get(datasetId);

// By name and version
const dataset = await DatasetManager.findByNameAndVersion('my-dataset', '1.0.0');

// List all datasets
const datasets = await DatasetManager.list({
  tags: ['production'],
  minQualityScore: 75
});
```

---

## Extracting Production Examples

### Automated Production Extraction

Extract high-quality examples from production systems:

```javascript
const ProductionExampleExtractor = require('./scripts/training/extractProductionExamples');

const extractor = new ProductionExampleExtractor({
  datasetName: 'contact-tier-training',
  datasetVersion: '2.0.0',
  qualityThreshold: 75,
  batchSize: 100,
  sources: ['agent_decisions', 'decision_feedback']
});

const stats = await extractor.extract();

console.log(`Extracted: ${stats.saved}/${stats.total}`);
console.log(`Duplicates: ${stats.duplicates}`);
console.log(`Failed validation: ${stats.failedValidation}`);
```

### Configuration Options

```javascript
{
  datasetName: 'string',          // Dataset name
  datasetVersion: 'string',       // Version string (semantic versioning)
  qualityThreshold: 0-100,        // Minimum quality score
  batchSize: 50-1000,             // Examples per batch
  sources: ['source1', 'source2'], // Data sources to extract from
  dateRange: {                    // Optional date filter
    start: '2024-01-01',
    end: '2024-12-31'
  }
}
```

### Deduplication

The system automatically deduplicates examples using:
1. `source_decision_id` (if available)
2. SHA-256 hash of `input_data`

---

## Labeling Workflow

### Starting a Labeling Session

```javascript
const LabelingService = require('./server/services/labelingService');

// Start session
const session = await LabelingService.startSession(
  'labeler-email@example.com',
  'initial_labeling'  // or 'validation', 'review'
);

console.log(`Session ID: ${session.sessionId}`);
```

### Getting Next Example to Label

```javascript
const example = await LabelingService.getNextExample(datasetId, {
  exampleType: 'contact_tier',      // Optional filter
  minQualityScore: 75                // Optional filter
});

if (example) {
  console.log('Label this example:', example.input_data);
  console.log('Current output:', example.expected_output);
}
```

### Submitting Labels

```javascript
await LabelingService.submitLabel({
  exampleId: example.id,
  sessionId: session.sessionId,
  labelerId: 'labeler-email@example.com',
  labelType: 'validation',
  labelValue: {
    tier: 'A',
    confidence: 0.95,
    reasoning: 'Clear executive-level title'
  },
  confidence: 0.9,
  notes: 'High confidence example'
});
```

### Rejecting Examples

```javascript
await LabelingService.rejectExample(
  exampleId,
  sessionId,
  'labeler-email@example.com',
  'Insufficient information in input data'
);
```

### Ending Session

```javascript
const summary = await LabelingService.endSession(session.sessionId);
console.log(`Labeled ${summary.examplesLabeled} examples`);
```

### Labeling Progress

```javascript
const progress = await LabelingService.getProgress(datasetId);

console.log(`Total: ${progress.totalExamples}`);
console.log(`Validated: ${progress.validated}`);
console.log(`Pending: ${progress.pending}`);
console.log(`Completion: ${progress.completionRate}%`);
```

### Labeler Statistics

```javascript
const stats = await LabelingService.getLabelerStats('labeler@example.com', 30);

console.log(`Sessions: ${stats.totalSessions}`);
console.log(`Total labeled: ${stats.totalLabeled}`);
console.log(`Avg per session: ${stats.avgPerSession}`);
console.log(`Avg duration: ${stats.avgDurationMinutes} minutes`);
```

---

## Quality Management

### Dataset Validation

Run comprehensive validation checks:

```javascript
const DatasetValidationService = require('./server/services/datasetValidationService');

const validation = await DatasetValidationService.validateDataset(datasetId);

console.log(`Overall Status: ${validation.overallStatus}`);
console.log('Checks:');
console.log(`  Schema: ${validation.checks.schema.status}`);
console.log(`  Quality: ${validation.checks.dataQuality.status}`);
console.log(`  Distribution: ${validation.checks.distribution.status}`);
console.log(`  Completeness: ${validation.checks.completeness.status}`);
console.log(`  Consistency: ${validation.checks.consistency.status}`);
console.log(`  Integrity: ${validation.checks.integrity.status}`);

// Review recommendations
validation.recommendations.forEach(rec => {
  console.log(`[${rec.priority}] ${rec.category}: ${rec.message}`);
});
```

### Validation Checks

1. **Schema Validation**: Verifies data structure and types
2. **Data Quality**: Checks quality scores and tier distribution
3. **Distribution**: Analyzes example type balance
4. **Completeness**: Validates required fields
5. **Consistency**: Checks for logical consistency
6. **Integrity**: Verifies referential integrity

---

## Exporting Data

### Multi-Format Export

Export datasets in various ML framework formats:

```javascript
const DatasetExportService = require('./server/services/datasetExportService');

// JSONL export (most common for ML)
const result = await DatasetExportService.export({
  datasetId: dataset.id,
  format: 'jsonl',
  outputPath: '/tmp/training-data.jsonl',
  filters: {
    validationStatus: 'validated',
    minQualityScore: 75
  }
});

console.log(`Exported ${result.totalExamples} examples`);
console.log(`Files: ${result.files.join(', ')}`);
```

### Supported Formats

- **JSONL**: JSON Lines (one JSON object per line)
- **CSV**: Comma-separated values with JSON columns
- **JSON**: Standard JSON array format

### Train/Val/Test Splits

```javascript
const result = await DatasetExportService.export({
  datasetId: dataset.id,
  format: 'jsonl',
  outputPath: '/tmp/training-data.jsonl',
  split: {
    train: 0.7,   // 70% training
    val: 0.15,    // 15% validation
    test: 0.15,   // 15% testing
    shuffle: true,
    stratify: 'example_type'  // Optional: maintain type distribution
  },
  filters: {
    validationStatus: 'validated'
  }
});

// Creates three files:
// - training-data.train.jsonl
// - training-data.val.jsonl
// - training-data.test.jsonl
```

### Export with Transformations

```javascript
const result = await DatasetExportService.export({
  datasetId: dataset.id,
  format: 'jsonl',
  outputPath: '/tmp/training-data.jsonl',
  transform: (example) => ({
    // Custom transformation
    input: example.input_data,
    output: example.expected_output,
    weight: example.quality_score / 100  // Use quality as weight
  }),
  compress: true  // Optional: gzip compression
});
```

---

## Version Control

### Git-like Versioning

The system uses Git-like version control with SHA-256 commit hashes:

```javascript
// Create a commit
const commit = await dataset.commit({
  message: 'Added 100 high-quality contact tier examples',
  author: 'your-name@example.com',
  examplesAdded: 100,
  examplesModified: 0,
  examplesRemoved: 0
});

console.log(`Commit: ${commit.commit_hash.substring(0, 8)}...`);
console.log(`Parent: ${commit.parent_commit_hash?.substring(0, 8) || 'none'}`);
```

### Commit History

```javascript
const history = await dataset.getCommitHistory(10);

history.forEach(commit => {
  console.log(`${commit.commit_hash.substring(0, 8)} - ${commit.message}`);
  console.log(`  by ${commit.author} at ${commit.committed_at}`);
  console.log(`  +${commit.examples_added || 0} -${commit.examples_removed || 0} ~${commit.examples_modified || 0}`);
});
```

### Rollback to Commit

```javascript
// Note: Rollback functionality would be implemented based on specific requirements
// Current implementation tracks history but doesn't support automatic rollback
```

---

## Analytics and Monitoring

### Generate Comprehensive Analytics Report

```javascript
const DatasetAnalyticsService = require('./server/services/datasetAnalyticsService');

const report = await DatasetAnalyticsService.generateReport(datasetId);

// Summary statistics
console.log('Summary:');
console.log(`  Total examples: ${report.summary.totalExamples}`);
console.log(`  Avg quality: ${report.summary.avgQualityScore}`);
console.log(`  Validation rate: ${report.summary.validationRate}%`);

// Quality metrics
console.log('\nQuality Metrics:');
console.log(`  Min: ${report.qualityMetrics.min}`);
console.log(`  Max: ${report.qualityMetrics.max}`);
console.log(`  Median: ${report.qualityMetrics.median}`);
console.log(`  Gold: ${report.qualityMetrics.tiers.gold}`);
console.log(`  Silver: ${report.qualityMetrics.tiers.silver}`);
console.log(`  Bronze: ${report.qualityMetrics.tiers.bronze}`);

// Distribution
console.log('\nType Distribution:');
report.distribution.byType.forEach(type => {
  console.log(`  ${type.type}: ${type.count} examples (avg quality: ${type.avgQuality})`);
});

// Coverage
console.log('\nCoverage:');
console.log(`  Overall completeness: ${report.coverage.overallCompleteness}%`);

// Recommendations
console.log('\nRecommendations:');
report.recommendations.forEach(rec => {
  console.log(`  [${rec.priority}] ${rec.issue}`);
  console.log(`    → ${rec.recommendation}`);
});
```

### Historical Analytics

```javascript
const history = await DatasetAnalyticsService.getHistoricalAnalytics(
  datasetId,
  'quality_metrics',
  30  // last 30 days
);

history.forEach(entry => {
  console.log(`${entry.computedAt}: Avg quality ${entry.value.avg}`);
});
```

---

## API Reference

### DatasetManager

```javascript
const { DatasetManager } = require('./server/services/datasetManager');

// Create dataset
await DatasetManager.create({ name, version, description, createdBy, tags });

// Get dataset
await DatasetManager.get(id);
await DatasetManager.findByNameAndVersion(name, version);

// List datasets
await DatasetManager.list({ tags, minQualityScore, limit, offset });

// Update dataset
await DatasetManager.update(id, { description, tags });

// Delete dataset
await DatasetManager.delete(id);
```

### Dataset Instance Methods

```javascript
const dataset = await DatasetManager.get(id);

// Examples
await dataset.addExamples(examples);
await dataset.getExamples(filters);
await dataset.updateExample(exampleId, updates);
await dataset.deleteExample(exampleId);

// Statistics
await dataset.getStats();

// Version control
await dataset.commit({ message, author, examplesAdded, examplesModified, examplesRemoved });
await dataset.getCommitHistory(limit);

// Validation
await dataset.validate();
```

### ProductionExampleExtractor

```javascript
const extractor = new ProductionExampleExtractor(config);
const stats = await extractor.extract();
```

### DatasetValidationService

```javascript
const validation = await DatasetValidationService.validateDataset(datasetId);
const check = await DatasetValidationService.validateSchema(datasetId);
```

### DatasetExportService

```javascript
const result = await DatasetExportService.export({ datasetId, format, outputPath, split, filters, transform, compress });
const metadata = await DatasetExportService.generateMetadata(datasetId, exportConfig, exportResult);
```

### LabelingService

```javascript
const session = await LabelingService.startSession(labelerId, sessionType);
const example = await LabelingService.getNextExample(datasetId, filters);
await LabelingService.submitLabel({ exampleId, sessionId, labelerId, labelType, labelValue, confidence, notes });
await LabelingService.rejectExample(exampleId, sessionId, labelerId, reason);
const summary = await LabelingService.endSession(sessionId);
const progress = await LabelingService.getProgress(datasetId);
const stats = await LabelingService.getLabelerStats(labelerId, days);
const reliability = await LabelingService.calculateInterRaterReliability(datasetId);
```

### DatasetAnalyticsService

```javascript
const report = await DatasetAnalyticsService.generateReport(datasetId);
const history = await DatasetAnalyticsService.getHistoricalAnalytics(datasetId, metricName, days);
```

---

## Troubleshooting

### Common Issues

**Issue: "Dataset with this name and version already exists"**
- Solution: Use a different version number or delete the existing dataset

**Issue: "Quality score out of range"**
- Solution: Ensure quality scores are between 0-100

**Issue: "No examples to label"**
- Solution: Check filters on `getNextExample()` - may be too restrictive

**Issue: "Export file is empty"**
- Solution: Verify filters aren't excluding all examples; check `validationStatus`

**Issue: "Commit hash generation failed"**
- Solution: Ensure all required fields (message, author) are provided

### Performance Optimization

**Large Datasets (>10,000 examples)**
- Use batch operations for adding examples
- Apply filters early in export pipelines
- Consider incremental exports with date ranges

**Export Performance**
- Use JSONL format for fastest exports
- Enable compression for large files
- Export in parallel for multiple datasets

**Labeling Efficiency**
- Start multiple labeling sessions for team workflows
- Use quality score filters to prioritize high-value examples
- Monitor labeler statistics to optimize throughput

### Data Quality Tips

1. **Set Appropriate Thresholds**
   - Production extraction: 75+ quality score
   - Training data: 80+ quality score
   - Validation data: 85+ quality score

2. **Maintain Balance**
   - Monitor distribution reports
   - Extract proportionally from all example types
   - Use stratified sampling for exports

3. **Regular Validation**
   - Run validation after major updates
   - Review analytics reports weekly
   - Track quality trends over time

4. **Version Control Best Practices**
   - Commit after significant changes
   - Use descriptive commit messages
   - Track who made changes and when

---

## Support and Resources

### Additional Documentation

- [Architecture Document](./SPRINT_43_GOLDEN_DATASET_ARCHITECTURE.md)
- Database schema: `db/migrations/2025_11_20_golden_dataset_system.sql`

### Running Tests

```bash
# Checkpoint 1: Schema and pipeline
node scripts/testing/checkpoint1Sprint43.js

# Checkpoint 2: Data extraction and quality
node scripts/testing/checkpoint2Sprint43.js

# Checkpoint 3: Export and versioning
node scripts/testing/checkpoint3Sprint43.js

# Checkpoint 4: Analytics and labeling
node scripts/testing/checkpoint4Sprint43.js
```

### Example Workflows

See `scripts/training/extractProductionExamples.js` for a complete production extraction example.

---

**Version**: 1.0.0
**Last Updated**: 2025-11-20
**Sprint**: 43
