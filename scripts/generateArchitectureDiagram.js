#!/usr/bin/env node
/**
 * UPR OS Architecture Diagram Generator
 * Creates a comprehensive visual diagram of the system architecture
 */

import { createCanvas } from 'canvas';
import fs from 'fs';

// Canvas dimensions (high resolution for print/presentation)
const WIDTH = 2400;
const HEIGHT = 1600;

// Brand colors
const COLORS = {
  primary: '#1a365d',
  secondary: '#2563eb',
  accent: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  dark: '#1f2937',
  medium: '#6b7280',
  light: '#e5e7eb',
  lighter: '#f3f4f6',
  white: '#ffffff',
  chatOS: '#3b82f6',
  siva: '#8b5cf6',
  workflow: '#06b6d4',
  stream: '#14b8a6',
  trust: '#f97316',
  data: '#64748b',
};

// Create canvas
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// Helper functions
function drawRoundedRect(x, y, w, h, r, fill, stroke = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawArrow(fromX, fromY, toX, toY, color = COLORS.medium, lineWidth = 2) {
  const headLength = 12;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Arrow head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawText(text, x, y, fontSize, color, align = 'left', bold = false, maxWidth = null) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (maxWidth && ctx.measureText(text).width > maxWidth) {
    // Truncate text
    while (ctx.measureText(text + '...').width > maxWidth && text.length > 0) {
      text = text.slice(0, -1);
    }
    text += '...';
  }
  ctx.fillText(text, x, y);
}

function drawBox(x, y, w, h, title, items, bgColor, titleColor = COLORS.white, borderColor = null) {
  drawRoundedRect(x, y, w, h, 8, bgColor, borderColor || bgColor, 3);

  // Title bar
  drawRoundedRect(x, y, w, 36, 8, titleColor === COLORS.white ? bgColor : 'rgba(0,0,0,0.2)');
  ctx.fillStyle = titleColor === COLORS.white ? bgColor : bgColor;
  ctx.fillRect(x, y + 20, w, 16);

  drawText(title, x + w/2, y + 18, 14, titleColor, 'center', true);

  // Items
  items.forEach((item, i) => {
    drawText(item, x + 12, y + 50 + i * 22, 12, COLORS.white, 'left');
  });
}

// ============================================
// DRAW THE DIAGRAM
// ============================================

// Background
ctx.fillStyle = COLORS.white;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Title
drawText('UPR OS Architecture', WIDTH/2, 45, 36, COLORS.primary, 'center', true);
drawText('AI-Native Lead Intelligence Platform', WIDTH/2, 80, 18, COLORS.medium, 'center');

// ============================================
// LAYER 1: USER INTERFACE (Top)
// ============================================
const uiY = 120;

// UI Layer Label
drawRoundedRect(30, uiY, 120, 32, 4, COLORS.chatOS);
drawText('UI LAYER', 90, uiY + 16, 12, COLORS.white, 'center', true);

// Chat OS (Main)
drawRoundedRect(180, uiY - 10, 500, 180, 12, COLORS.chatOS, null, 3);
drawText('CHAT OS', 430, uiY + 10, 20, COLORS.white, 'center', true);
drawText('Master Interface', 430, uiY + 32, 12, 'rgba(255,255,255,0.8)', 'center');

// Chat sub-components
const chatComponents = [
  { name: 'Chat Interface', x: 195, desc: 'NL queries, streaming' },
  { name: 'Cmd+K Palette', x: 340, desc: 'Quick actions' },
  { name: 'Inline Copilot', x: 485, desc: 'Context hints' },
];
chatComponents.forEach((c, i) => {
  drawRoundedRect(c.x, uiY + 55, 130, 50, 6, 'rgba(255,255,255,0.15)');
  drawText(c.name, c.x + 65, uiY + 72, 11, COLORS.white, 'center', true);
  drawText(c.desc, c.x + 65, uiY + 90, 9, 'rgba(255,255,255,0.7)', 'center');
});

// Proactive Alerts
drawRoundedRect(195, uiY + 115, 160, 40, 6, 'rgba(255,255,255,0.15)');
drawText('Proactive Alerts', 275, uiY + 128, 11, COLORS.white, 'center', true);
drawText('Signals, timing, risks', 275, uiY + 143, 9, 'rgba(255,255,255,0.7)', 'center');

// Smart Forms
drawRoundedRect(365, uiY + 115, 160, 40, 6, 'rgba(255,255,255,0.15)');
drawText('Smart Forms', 445, uiY + 128, 11, COLORS.white, 'center', true);
drawText('Auto-fill, validation', 445, uiY + 143, 9, 'rgba(255,255,255,0.7)', 'center');

// Additional UI Surfaces
const surfaces = [
  { name: 'SIVA Dashboard', icon: '🤖' },
  { name: 'Knowledge Graph', icon: '🕸️' },
  { name: 'Filter Builder', icon: '🔍' },
  { name: 'Workflow Builder', icon: '⚡' },
  { name: 'Report Designer', icon: '📊' },
];
surfaces.forEach((s, i) => {
  const x = 720 + (i % 3) * 170;
  const y = uiY + (Math.floor(i / 3) * 75);
  drawRoundedRect(x, y, 155, 60, 8, COLORS.lighter, COLORS.light, 2);
  drawText(s.icon + ' ' + s.name, x + 78, y + 30, 12, COLORS.dark, 'center', true);
});

// ============================================
// LAYER 2: NLU + INTENT ENGINE
// ============================================
const nluY = 330;

drawRoundedRect(30, nluY, 120, 32, 4, COLORS.secondary);
drawText('NLU LAYER', 90, nluY + 16, 12, COLORS.white, 'center', true);

drawRoundedRect(180, nluY, 800, 80, 10, COLORS.secondary);
drawText('NLU + INTENT ENGINE', 580, nluY + 20, 16, COLORS.white, 'center', true);
drawText('Claude 3.5 Sonnet  •  9 Intent Types  •  Entity Extraction  •  Context Awareness', 580, nluY + 48, 12, 'rgba(255,255,255,0.85)', 'center');

// Intent types on the side
const intents = ['query_leads', 'score_lead', 'match_products', 'generate_outreach', 'analytics'];
drawRoundedRect(1020, nluY - 20, 180, 120, 8, COLORS.lighter, COLORS.secondary, 2);
drawText('Intent Types', 1110, nluY, 11, COLORS.secondary, 'center', true);
intents.forEach((intent, i) => {
  drawText('• ' + intent, 1035, nluY + 22 + i * 18, 10, COLORS.dark);
});

// ============================================
// LAYER 3: SIVA TOOLS + WORKFLOW + STREAM
// ============================================
const coreY = 450;

drawRoundedRect(30, coreY, 120, 32, 4, COLORS.siva);
drawText('CORE LAYER', 90, coreY + 16, 12, COLORS.white, 'center', true);

// SIVA Tools
drawRoundedRect(180, coreY, 380, 220, 10, COLORS.siva);
drawText('SIVA TOOLS', 370, coreY + 20, 16, COLORS.white, 'center', true);
drawText('15 Tools  •  6 Workflows', 370, coreY + 40, 11, 'rgba(255,255,255,0.8)', 'center');

// Tool categories
const toolCategories = [
  { name: 'STRICT (10)', color: COLORS.accent, tools: ['CompanyQuality', 'ContactTier', 'TimingScore', 'ProductMatch'] },
  { name: 'DELEGATED (5)', color: COLORS.warning, tools: ['MessageGen', 'FollowUp', 'Objection'] },
];
toolCategories.forEach((cat, i) => {
  const x = 195 + i * 175;
  drawRoundedRect(x, coreY + 60, 160, 145, 6, 'rgba(255,255,255,0.1)');
  drawRoundedRect(x, coreY + 60, 160, 28, 6, cat.color);
  drawText(cat.name, x + 80, coreY + 74, 11, COLORS.white, 'center', true);
  cat.tools.forEach((tool, j) => {
    drawText('• ' + tool, x + 12, coreY + 100 + j * 22, 10, COLORS.white);
  });
});

// Workflow Engine
drawRoundedRect(580, coreY, 200, 220, 10, COLORS.workflow);
drawText('WORKFLOW', 680, coreY + 20, 16, COLORS.white, 'center', true);
drawText('ENGINE', 680, coreY + 38, 16, COLORS.white, 'center', true);

const workflowTypes = ['Sequential', 'Parallel', 'Conditional', 'Fallback', 'Batch'];
workflowTypes.forEach((type, i) => {
  drawRoundedRect(595, coreY + 65 + i * 28, 170, 24, 4, 'rgba(255,255,255,0.15)');
  drawText(type, 680, coreY + 77 + i * 28, 11, COLORS.white, 'center');
});

// Stream Orchestration
drawRoundedRect(800, coreY, 200, 220, 10, COLORS.stream);
drawText('STREAM', 900, coreY + 20, 16, COLORS.white, 'center', true);
drawText('ORCHESTRATION', 900, coreY + 38, 16, COLORS.white, 'center', true);

const streamTypes = ['Chat SSE', 'Agent Activity', 'Enrichment', 'Reconnection', 'Offline Queue'];
streamTypes.forEach((type, i) => {
  drawRoundedRect(815, coreY + 65 + i * 28, 170, 24, 4, 'rgba(255,255,255,0.15)');
  drawText(type, 900, coreY + 77 + i * 28, 11, COLORS.white, 'center');
});

// ============================================
// LAYER 4: TRUST FRAMEWORK (Right side)
// ============================================
const trustY = 450;

drawRoundedRect(1020, trustY, 180, 220, 10, COLORS.trust);
drawText('TRUST', 1110, trustY + 20, 16, COLORS.white, 'center', true);
drawText('FRAMEWORK', 1110, trustY + 38, 16, COLORS.white, 'center', true);

const trustLevels = [
  { level: 'FULL', conf: '≥90%', color: COLORS.accent },
  { level: 'HIGH', conf: '75-89%', color: COLORS.secondary },
  { level: 'MEDIUM', conf: '60-74%', color: COLORS.warning },
  { level: 'LOW', conf: '<60%', color: COLORS.danger },
];
trustLevels.forEach((t, i) => {
  drawRoundedRect(1035, trustY + 60 + i * 38, 150, 32, 4, t.color);
  drawText(t.level, 1070, trustY + 76 + i * 38, 11, COLORS.white, 'center', true);
  drawText(t.conf, 1145, trustY + 76 + i * 38, 10, COLORS.white, 'center');
});

// ============================================
// LAYER 5: DATA LAYER (Bottom)
// ============================================
const dataY = 710;

drawRoundedRect(30, dataY, 120, 32, 4, COLORS.data);
drawText('DATA LAYER', 90, dataY + 16, 12, COLORS.white, 'center', true);

// Databases
const databases = [
  { name: 'PostgreSQL', desc: 'Primary data, sessions, audit', icon: '🐘', color: '#336791' },
  { name: 'Redis', desc: 'Queue, cache, rate limits', icon: '🔴', color: '#dc382d' },
  { name: 'Neo4j', desc: 'Knowledge graph, relationships', icon: '🕸️', color: '#008cc1' },
];
databases.forEach((db, i) => {
  const x = 180 + i * 210;
  drawRoundedRect(x, dataY, 195, 80, 8, db.color);
  drawText(db.icon + ' ' + db.name, x + 97, dataY + 25, 14, COLORS.white, 'center', true);
  drawText(db.desc, x + 97, dataY + 50, 10, 'rgba(255,255,255,0.85)', 'center');
});

// External Services
drawRoundedRect(810, dataY, 390, 80, 8, COLORS.dark);
drawText('EXTERNAL SERVICES', 1005, dataY + 20, 12, COLORS.white, 'center', true);

const services = ['Claude', 'OpenAI', 'Apollo', 'SerpAPI'];
services.forEach((s, i) => {
  drawRoundedRect(825 + i * 92, dataY + 40, 82, 28, 4, 'rgba(255,255,255,0.15)');
  drawText(s, 866 + i * 92, dataY + 54, 10, COLORS.white, 'center');
});

// ============================================
// LAYER 6: SECURITY (Left side bar)
// ============================================
const secY = 820;

drawRoundedRect(180, secY, 600, 70, 8, COLORS.primary);
drawText('🔒 SECURITY MODEL', 280, secY + 20, 14, COLORS.white, 'left', true);

const secFeatures = ['JWT Auth', 'RBAC', 'Multi-tenant', 'Rate Limiting', 'PII Redaction', 'Audit Log'];
secFeatures.forEach((f, i) => {
  drawRoundedRect(195 + i * 95, secY + 38, 88, 24, 4, 'rgba(255,255,255,0.15)');
  drawText(f, 239 + i * 95, secY + 50, 9, COLORS.white, 'center');
});

// ============================================
// LAYER 7: ANTI-CLONING (Right side bar)
// ============================================
drawRoundedRect(800, secY, 400, 70, 8, COLORS.danger);
drawText('🛡️ COMPETITIVE MOAT', 900, secY + 20, 14, COLORS.white, 'left', true);

const moatFeatures = ['Proprietary Algos', 'Domain Data', 'Trained Models', 'Velocity'];
moatFeatures.forEach((f, i) => {
  drawRoundedRect(815 + i * 95, secY + 38, 88, 24, 4, 'rgba(255,255,255,0.15)');
  drawText(f, 859 + i * 95, secY + 50, 9, COLORS.white, 'center');
});

// ============================================
// CONNECTING ARROWS
// ============================================

// UI to NLU
drawArrow(430, uiY + 170, 430, nluY, COLORS.secondary, 3);
drawArrow(1050, uiY + 150, 1050, nluY + 40, COLORS.medium, 2);

// NLU to Core Layer
drawArrow(300, nluY + 80, 300, coreY, COLORS.siva, 2);
drawArrow(580, nluY + 80, 580, coreY, COLORS.workflow, 2);
drawArrow(800, nluY + 80, 800, coreY, COLORS.stream, 2);

// Core to Data
drawArrow(370, coreY + 220, 370, dataY, COLORS.data, 2);
drawArrow(680, coreY + 220, 680, dataY, COLORS.data, 2);
drawArrow(900, coreY + 220, 900, dataY, COLORS.data, 2);

// Trust Framework connections
drawArrow(1020, coreY + 110, 1000, coreY + 110, COLORS.trust, 2);

// ============================================
// LEGEND
// ============================================
const legendY = 920;

drawRoundedRect(180, legendY, 1020, 60, 8, COLORS.lighter, COLORS.light, 1);
drawText('LEGEND', 220, legendY + 30, 12, COLORS.dark, 'left', true);

const legendItems = [
  { color: COLORS.chatOS, label: 'Chat OS' },
  { color: COLORS.secondary, label: 'NLU' },
  { color: COLORS.siva, label: 'SIVA Tools' },
  { color: COLORS.workflow, label: 'Workflow' },
  { color: COLORS.stream, label: 'Streaming' },
  { color: COLORS.trust, label: 'Trust' },
  { color: COLORS.data, label: 'Data' },
];
legendItems.forEach((item, i) => {
  const x = 300 + i * 130;
  drawRoundedRect(x, legendY + 20, 20, 20, 4, item.color);
  drawText(item.label, x + 28, legendY + 30, 11, COLORS.dark);
});

// ============================================
// FOOTER
// ============================================
drawText('UPR 2030  •  15 SIVA Tools  •  10 Sprints  •  73 Features', WIDTH/2, HEIGHT - 30, 14, COLORS.medium, 'center');

// ============================================
// STATS BOXES (Top Right)
// ============================================
const statsX = 1240;
const statsY = 120;

drawRoundedRect(statsX, statsY, 130, 160, 10, COLORS.primary);
drawText('KEY METRICS', statsX + 65, statsY + 20, 12, COLORS.white, 'center', true);

const stats = [
  { value: '15', label: 'SIVA Tools' },
  { value: '73', label: 'Features' },
  { value: '10', label: 'Sprints' },
  { value: '85%', label: 'Target Trust' },
];
stats.forEach((s, i) => {
  drawText(s.value, statsX + 65, statsY + 55 + i * 32, 20, COLORS.white, 'center', true);
  drawText(s.label, statsX + 65, statsY + 75 + i * 32, 9, 'rgba(255,255,255,0.7)', 'center');
});

// ============================================
// SAVE THE IMAGE
// ============================================
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('./docs/UPR_OS_ARCHITECTURE_DIAGRAM.png', buffer);

console.log('Architecture diagram created successfully!');
console.log('Output: ./docs/UPR_OS_ARCHITECTURE_DIAGRAM.png');
console.log(`Size: ${WIDTH}x${HEIGHT}px`);
