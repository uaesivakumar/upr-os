#!/usr/bin/env node
/**
 * Generate Lifecycle State Machine Diagram
 */

import { LifecycleVisualization } from '../server/services/lifecycleVisualization.js';
import { writeFileSync } from 'fs';

console.log('🎨 Generating Lifecycle State Machine Visualization...\n');

const viz = new LifecycleVisualization();

// Generate documentation
const doc = viz.generateFullDocumentation();

// Save to file
const outputPath = './docs/LIFECYCLE_DIAGRAM.md';
writeFileSync(outputPath, doc);

console.log(`✅ Diagram generated: ${outputPath}\n`);

// Also print ASCII diagram
console.log(viz.generateASCIIDiagram());

console.log('\n📊 State Machine Graph Generated!');
