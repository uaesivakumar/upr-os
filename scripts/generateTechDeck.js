#!/usr/bin/env node
/**
 * UPR 2030 Tech Deck Generator
 * Creates investor/stakeholder presentation
 */

import PptxGenJS from 'pptxgenjs';

// Brand colors
const COLORS = {
  primary: '1a365d',      // Deep blue
  secondary: '2563eb',    // Bright blue
  accent: '10b981',       // Green
  warning: 'f59e0b',      // Amber
  dark: '1f2937',         // Dark gray
  light: 'f3f4f6',        // Light gray
  white: 'ffffff',
};

// Create presentation
const pres = new PptxGenJS();
pres.layout = 'LAYOUT_16x9';
pres.title = 'UPR 2030 - AI-Native Lead Intelligence';
pres.author = 'UPR Team';
pres.company = 'Emirates NBD';

// Helper function for title slides
function addTitleSlide(title, subtitle) {
  const slide = pres.addSlide();
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: COLORS.primary },
  });
  slide.addText(title, {
    x: 0.5, y: 2.5, w: '90%', h: 1.5,
    fontSize: 44, bold: true, color: COLORS.white,
    align: 'center',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 4, w: '90%', h: 0.8,
      fontSize: 24, color: COLORS.light,
      align: 'center',
    });
  }
  return slide;
}

// Helper for content slides
function addContentSlide(title) {
  const slide = pres.addSlide();
  slide.addText(title, {
    x: 0.5, y: 0.3, w: '90%', h: 0.8,
    fontSize: 32, bold: true, color: COLORS.primary,
  });
  slide.addShape(pres.ShapeType.rect, {
    x: 0.5, y: 1.0, w: 2, h: 0.05,
    fill: { color: COLORS.secondary },
  });
  return slide;
}

// ============================================
// SLIDE 1: Title
// ============================================
const slide1 = addTitleSlide(
  'UPR 2030',
  'AI-Native Lead Intelligence Platform'
);
slide1.addText('Investor & Stakeholder Overview', {
  x: 0.5, y: 4.8, w: '90%', h: 0.5,
  fontSize: 18, color: COLORS.light, align: 'center',
});
slide1.addText('November 2025', {
  x: 0.5, y: 5.3, w: '90%', h: 0.4,
  fontSize: 14, color: COLORS.light, align: 'center',
});

// ============================================
// SLIDE 2: The Problem
// ============================================
const slide2 = addContentSlide('The Problem');
slide2.addText([
  { text: 'Sales teams waste ', options: { fontSize: 24, color: COLORS.dark } },
  { text: '70% of their time', options: { fontSize: 24, bold: true, color: COLORS.warning } },
  { text: ' on non-selling activities', options: { fontSize: 24, color: COLORS.dark } },
], { x: 0.5, y: 1.5, w: '90%', h: 0.6 });

const problems = [
  { icon: '7', text: 'clicks to qualify a single lead', metric: '7 CLICKS' },
  { icon: '20', text: 'minutes to draft personalized outreach', metric: '20 MIN' },
  { icon: '30', text: 'minutes to prioritize daily leads', metric: '30 MIN' },
  { icon: '45', text: 'minutes for company research', metric: '45 MIN' },
];

problems.forEach((p, i) => {
  const y = 2.3 + (i * 0.9);
  slide2.addShape(pres.ShapeType.rect, {
    x: 0.5, y: y, w: 1.2, h: 0.7,
    fill: { color: COLORS.warning },
  });
  slide2.addText(p.metric, {
    x: 0.5, y: y + 0.15, w: 1.2, h: 0.4,
    fontSize: 14, bold: true, color: COLORS.white, align: 'center',
  });
  slide2.addText(p.text, {
    x: 1.9, y: y + 0.2, w: 7, h: 0.4,
    fontSize: 18, color: COLORS.dark,
  });
});

// ============================================
// SLIDE 3: The Solution
// ============================================
const slide3 = addContentSlide('The Solution: Chat OS');
slide3.addText([
  { text: '"', options: { fontSize: 36, color: COLORS.light } },
  { text: 'Features navigate to users, not users to features', options: { fontSize: 24, italic: true, color: COLORS.primary } },
  { text: '"', options: { fontSize: 36, color: COLORS.light } },
], { x: 0.5, y: 1.4, w: '90%', h: 0.8 });

slide3.addText('Traditional CRM', {
  x: 0.5, y: 2.5, w: 4, h: 0.5,
  fontSize: 18, bold: true, color: COLORS.dark,
});
slide3.addText('User > Navigate > Form > Submit > Wait > Result', {
  x: 0.5, y: 3.0, w: 4.5, h: 0.4,
  fontSize: 14, color: COLORS.warning,
});

slide3.addText('UPR 2030', {
  x: 5.5, y: 2.5, w: 4, h: 0.5,
  fontSize: 18, bold: true, color: COLORS.secondary,
});
slide3.addText('User Intent > AI Executes > User Approves', {
  x: 5.5, y: 3.0, w: 4.5, h: 0.4,
  fontSize: 14, color: COLORS.accent,
});

// Chat interface mockup
slide3.addShape(pres.ShapeType.roundRect, {
  x: 1, y: 3.8, w: 8, h: 2,
  fill: { color: COLORS.light },
  line: { color: COLORS.secondary, width: 2 },
});
slide3.addText('User: "Is TechCorp worth pursuing?"', {
  x: 1.2, y: 4.0, w: 7.5, h: 0.4,
  fontSize: 14, color: COLORS.dark,
});
slide3.addText('AI: "I analyzed TechCorp using 4 SIVA tools:\n' +
  '   Company Quality: 78/100 (HIGH confidence)\n' +
  '   Timing: OPTIMAL (expansion signal 12 days ago)\n' +
  '   Product Fit: Premium Salary Account (92% match)\n' +
  '   VERDICT: High-quality lead. Recommend immediate outreach."', {
  x: 1.2, y: 4.4, w: 7.5, h: 1.3,
  fontSize: 12, color: COLORS.accent,
});

// ============================================
// SLIDE 4: SIVA Engine
// ============================================
const slide4 = addContentSlide('SIVA: The AI Brain');
slide4.addText('Smart Intelligence for Value Assessment', {
  x: 0.5, y: 1.3, w: '90%', h: 0.5,
  fontSize: 18, italic: true, color: COLORS.dark,
});

// Tool categories
slide4.addShape(pres.ShapeType.rect, {
  x: 0.5, y: 2.0, w: 2.8, h: 3.2,
  fill: { color: COLORS.secondary },
});
slide4.addText('SCORING\nTOOLS', {
  x: 0.5, y: 2.1, w: 2.8, h: 0.6,
  fontSize: 14, bold: true, color: COLORS.white, align: 'center',
});
slide4.addText('CompanyQualityTool\nContactTierTool\nTimingScoreTool\nCompositeScoreTool', {
  x: 0.6, y: 2.7, w: 2.6, h: 1.8,
  fontSize: 11, color: COLORS.white,
});
slide4.addText('10 tools\nFull autonomy', {
  x: 0.5, y: 4.6, w: 2.8, h: 0.5,
  fontSize: 12, bold: true, color: COLORS.white, align: 'center',
});

slide4.addShape(pres.ShapeType.rect, {
  x: 3.5, y: 2.0, w: 2.8, h: 3.2,
  fill: { color: COLORS.accent },
});
slide4.addText('PRODUCT\nTOOLS', {
  x: 3.5, y: 2.1, w: 2.8, h: 0.6,
  fontSize: 14, bold: true, color: COLORS.white, align: 'center',
});
slide4.addText('BankingProductMatch\nOpeningContextTool\nOutreachChannelTool\nEdgeCasesTool', {
  x: 3.6, y: 2.7, w: 2.6, h: 1.8,
  fontSize: 11, color: COLORS.white,
});
slide4.addText('Banking-specific\nUAE-optimized', {
  x: 3.5, y: 4.6, w: 2.8, h: 0.5,
  fontSize: 12, bold: true, color: COLORS.white, align: 'center',
});

slide4.addShape(pres.ShapeType.rect, {
  x: 6.5, y: 2.0, w: 2.8, h: 3.2,
  fill: { color: COLORS.warning },
});
slide4.addText('GENERATION\nTOOLS', {
  x: 6.5, y: 2.1, w: 2.8, h: 0.6,
  fontSize: 14, bold: true, color: COLORS.white, align: 'center',
});
slide4.addText('OutreachMessageGen\nFollowUpStrategy\nObjectionHandler\nRelationshipTracker', {
  x: 6.6, y: 2.7, w: 2.6, h: 1.8,
  fontSize: 11, color: COLORS.white,
});
slide4.addText('5 tools\nHuman review', {
  x: 6.5, y: 4.6, w: 2.8, h: 0.5,
  fontSize: 12, bold: true, color: COLORS.white, align: 'center',
});

// ============================================
// SLIDE 5: Trust Framework
// ============================================
const slide5 = addContentSlide('Trust Framework');
slide5.addText('AI autonomy based on confidence + evidence', {
  x: 0.5, y: 1.3, w: '90%', h: 0.5,
  fontSize: 18, italic: true, color: COLORS.dark,
});

const trustLevels = [
  { level: 'FULL TRUST', conf: '>=90%', action: 'Auto-execute', color: COLORS.accent },
  { level: 'HIGH TRUST', conf: '75-89%', action: 'Show + allow override', color: COLORS.secondary },
  { level: 'MEDIUM TRUST', conf: '60-74%', action: 'Require confirmation', color: COLORS.warning },
  { level: 'LOW TRUST', conf: '<60%', action: 'Human review required', color: 'ef4444' },
];

trustLevels.forEach((t, i) => {
  const y = 2.0 + (i * 0.9);
  slide5.addShape(pres.ShapeType.rect, {
    x: 0.5, y: y, w: 2.5, h: 0.7,
    fill: { color: t.color },
  });
  slide5.addText(t.level, {
    x: 0.5, y: y + 0.2, w: 2.5, h: 0.3,
    fontSize: 14, bold: true, color: COLORS.white, align: 'center',
  });
  slide5.addText(t.conf, {
    x: 3.2, y: y + 0.2, w: 1.5, h: 0.3,
    fontSize: 14, color: COLORS.dark,
  });
  slide5.addText(t.action, {
    x: 5, y: y + 0.2, w: 4, h: 0.3,
    fontSize: 14, color: COLORS.dark,
  });
});

slide5.addText('Every AI decision includes:', {
  x: 0.5, y: 5.0, w: 4, h: 0.4,
  fontSize: 14, bold: true, color: COLORS.dark,
});
slide5.addText('Confidence Score | Evidence Sources | Tool Citations | Latency | Cost', {
  x: 0.5, y: 5.4, w: 8, h: 0.4,
  fontSize: 12, color: COLORS.secondary,
});

// ============================================
// SLIDE 6: Impact Metrics
// ============================================
const slide6 = addContentSlide('Impact: Before vs After');

const metrics = [
  { label: 'Clicks to qualify lead', before: '7', after: '1', unit: 'clicks' },
  { label: 'Time to create outreach', before: '20', after: '0.5', unit: 'min' },
  { label: 'Time to prioritize leads', before: '30', after: '0.1', unit: 'min' },
  { label: 'Company research', before: '45', after: '0.25', unit: 'min' },
];

slide6.addText('BEFORE', { x: 3.5, y: 1.5, w: 2, h: 0.4, fontSize: 16, bold: true, color: COLORS.warning, align: 'center' });
slide6.addText('AFTER', { x: 6, y: 1.5, w: 2, h: 0.4, fontSize: 16, bold: true, color: COLORS.accent, align: 'center' });

metrics.forEach((m, i) => {
  const y = 2.0 + (i * 1.0);
  slide6.addText(m.label, { x: 0.5, y: y + 0.2, w: 3, h: 0.4, fontSize: 14, color: COLORS.dark });

  slide6.addShape(pres.ShapeType.rect, {
    x: 3.5, y: y, w: 2, h: 0.7,
    fill: { color: COLORS.warning },
  });
  slide6.addText(m.before + ' ' + m.unit, {
    x: 3.5, y: y + 0.2, w: 2, h: 0.4,
    fontSize: 16, bold: true, color: COLORS.white, align: 'center',
  });

  slide6.addShape(pres.ShapeType.rect, {
    x: 6, y: y, w: 2, h: 0.7,
    fill: { color: COLORS.accent },
  });
  slide6.addText(m.after + ' ' + m.unit, {
    x: 6, y: y + 0.2, w: 2, h: 0.4,
    fontSize: 16, bold: true, color: COLORS.white, align: 'center',
  });
});

slide6.addText('Target: 85%+ user trust in AI decisions', {
  x: 0.5, y: 5.2, w: '90%', h: 0.5,
  fontSize: 18, bold: true, color: COLORS.primary, align: 'center',
});

// ============================================
// SLIDE 7: Competitive Moat
// ============================================
const slide7 = addContentSlide('Competitive Moat: 5 Layers');

const moatLayers = [
  { num: '1', title: 'Proprietary Algorithms', desc: 'UAE-specific scoring, banking fit criteria', color: COLORS.primary },
  { num: '2', title: 'Domain-Specific Data', desc: 'Emirates NBD products, UAE free zones', color: COLORS.secondary },
  { num: '3', title: 'Trained Models', desc: 'Learned from real user feedback & overrides', color: COLORS.accent },
  { num: '4', title: 'Integrated Architecture', desc: 'Chat OS + 15 tools designed together', color: COLORS.warning },
  { num: '5', title: 'Iteration Velocity', desc: '2-week sprints, 10 sprints planned', color: 'ef4444' },
];

moatLayers.forEach((m, i) => {
  const y = 1.6 + (i * 0.85);
  slide7.addShape(pres.ShapeType.ellipse, {
    x: 0.5, y: y, w: 0.6, h: 0.6,
    fill: { color: m.color },
  });
  slide7.addText(m.num, {
    x: 0.5, y: y + 0.15, w: 0.6, h: 0.3,
    fontSize: 16, bold: true, color: COLORS.white, align: 'center',
  });
  slide7.addText(m.title, {
    x: 1.3, y: y + 0.1, w: 3, h: 0.3,
    fontSize: 16, bold: true, color: COLORS.dark,
  });
  slide7.addText(m.desc, {
    x: 4.5, y: y + 0.1, w: 5, h: 0.4,
    fontSize: 14, color: COLORS.dark,
  });
});

slide7.addText('By the time competitors catch up, UPR is 5 sprints ahead', {
  x: 0.5, y: 5.2, w: '90%', h: 0.5,
  fontSize: 16, italic: true, color: COLORS.secondary, align: 'center',
});

// ============================================
// SLIDE 8: Roadmap
// ============================================
const slide8 = addContentSlide('2030 Roadmap: 10 Sprints');

const sprints = [
  { num: '54', name: 'Chat OS Enhancement', status: 'Next' },
  { num: '55', name: 'Predictive Intelligence', status: 'Q1' },
  { num: '56', name: 'Knowledge Graph', status: 'Q1' },
  { num: '57', name: 'Advanced Filters', status: 'Q1' },
  { num: '58', name: 'Workflow Builder', status: 'Q2' },
  { num: '59', name: 'Collaboration + RBAC', status: 'Q2' },
  { num: '60', name: 'Report Designer', status: 'Q2' },
  { num: '61', name: 'Mobile + PWA', status: 'Q3' },
  { num: '62', name: 'i18n + Arabic', status: 'Q3' },
  { num: '63', name: 'Integration Testing', status: 'Q3' },
];

sprints.forEach((s, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 0.5 + (col * 4.7);
  const y = 1.6 + (row * 0.85);

  slide8.addShape(pres.ShapeType.rect, {
    x: x, y: y, w: 0.6, h: 0.6,
    fill: { color: i < 2 ? COLORS.accent : COLORS.secondary },
  });
  slide8.addText(s.num, {
    x: x, y: y + 0.15, w: 0.6, h: 0.3,
    fontSize: 14, bold: true, color: COLORS.white, align: 'center',
  });
  slide8.addText(s.name, {
    x: x + 0.7, y: y + 0.15, w: 3, h: 0.3,
    fontSize: 14, color: COLORS.dark,
  });
  slide8.addText(s.status, {
    x: x + 3.7, y: y + 0.15, w: 0.7, h: 0.3,
    fontSize: 12, color: COLORS.light, align: 'right',
  });
});

slide8.addText('73 features across 10 sprints', {
  x: 0.5, y: 5.2, w: '90%', h: 0.5,
  fontSize: 16, bold: true, color: COLORS.primary, align: 'center',
});

// ============================================
// SLIDE 9: Technology Stack
// ============================================
const slide9 = addContentSlide('Technology Stack');

const stack = [
  { layer: 'AI', items: 'Claude 3.5 Sonnet | OpenAI GPT-4 | Custom NLU', color: COLORS.primary },
  { layer: 'Backend', items: 'Node.js | Express | PostgreSQL | Redis | Neo4j', color: COLORS.secondary },
  { layer: 'Frontend', items: 'React | TypeScript | TailwindCSS | React Query', color: COLORS.accent },
  { layer: 'Infra', items: 'Google Cloud Run | Cloud SQL | BullMQ', color: COLORS.warning },
  { layer: 'Data', items: 'Apollo | SerpAPI | RapidAPI (LinkedIn)', color: COLORS.dark },
];

stack.forEach((s, i) => {
  const y = 1.6 + (i * 0.9);
  slide9.addShape(pres.ShapeType.rect, {
    x: 0.5, y: y, w: 1.5, h: 0.7,
    fill: { color: s.color },
  });
  slide9.addText(s.layer, {
    x: 0.5, y: y + 0.2, w: 1.5, h: 0.3,
    fontSize: 14, bold: true, color: COLORS.white, align: 'center',
  });
  slide9.addText(s.items, {
    x: 2.2, y: y + 0.2, w: 7, h: 0.4,
    fontSize: 14, color: COLORS.dark,
  });
});

// ============================================
// SLIDE 10: Call to Action
// ============================================
const slide10 = addTitleSlide('The Future is Conversational', 'UPR 2030: Where AI Meets Sales Intelligence');

slide10.addText('15 SIVA Tools | 10 Sprints | 73 Features | 1 Vision', {
  x: 0.5, y: 4.5, w: '90%', h: 0.5,
  fontSize: 20, color: COLORS.light, align: 'center',
});

slide10.addText('Contact: UPR Team', {
  x: 0.5, y: 5.3, w: '90%', h: 0.4,
  fontSize: 14, color: COLORS.light, align: 'center',
});

// Save the presentation
const outputPath = './docs/UPR_2030_TECH_DECK.pptx';
pres.writeFile({ fileName: outputPath })
  .then(() => {
    console.log('Presentation created successfully!');
    console.log('Output: ' + outputPath);
  })
  .catch(err => {
    console.error('Error creating presentation:', err);
  });
