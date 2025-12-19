/**
 * SILENT VALIDATION - PHASE 5: Distribution Check
 *
 * Plots Human CRS vs SIVA CRS to visually verify correlation.
 * Generates ASCII scatter plot and summary statistics.
 *
 * From playbook:
 * - If real samples cluster on diagonal: correlation is genuine
 * - If scattered: CRS is noise
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// ASCII SCATTER PLOT
// ============================================================================

function asciiScatterPlot(data, width = 60, height = 20) {
  const xValues = data.map(d => d.human_crs);
  const yValues = data.map(d => d.siva_crs);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  // Create grid
  const grid = [];
  for (let i = 0; i < height; i++) {
    grid.push(new Array(width).fill(' '));
  }

  // Plot points
  const plotted = {};
  for (let i = 0; i < data.length; i++) {
    const x = Math.floor(((xValues[i] - xMin) / (xMax - xMin || 1)) * (width - 1));
    const y = height - 1 - Math.floor(((yValues[i] - yMin) / (yMax - yMin || 1)) * (height - 1));

    const key = `${x},${y}`;
    if (!plotted[key]) {
      plotted[key] = 0;
    }
    plotted[key]++;

    // Use different symbols for density
    const count = plotted[key];
    grid[y][x] = count === 1 ? '·' : count < 5 ? 'o' : count < 10 ? 'O' : '●';
  }

  // Draw diagonal (perfect correlation line)
  for (let i = 0; i < Math.min(width, height); i++) {
    const x = Math.floor(i * (width - 1) / (height - 1));
    const y = height - 1 - i;
    if (grid[y] && grid[y][x] === ' ') {
      grid[y][x] = '╲';
    }
  }

  // Build output
  let output = '';
  output += `\n  SIVA CRS ↑\n`;
  output += `  ${yMax.toFixed(1)} ┤` + '─'.repeat(width) + '\n';

  for (let i = 0; i < height; i++) {
    const yLabel = i === 0 ? '' : i === height - 1 ? yMin.toFixed(1) : '';
    output += `  ${yLabel.padStart(4)} │${grid[i].join('')}│\n`;
  }

  output += `       └${'─'.repeat(width)}┘\n`;
  output += `        ${xMin.toFixed(1)}${' '.repeat(width - 8)}${xMax.toFixed(1)}\n`;
  output += `                        Human CRS →\n`;

  return output;
}

// ============================================================================
// SUMMARY STATISTICS
// ============================================================================

function computeStatistics(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const min = sorted[0];
  const max = sorted[n - 1];
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];

  return { n, mean, stdDev, median, min, max, q1, q3 };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       SILENT VALIDATION - PHASE 5: Distribution Check            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Find correlation results
  const correlationDirs = readdirSync(__dirname)
    .filter(f => f.startsWith('correlation_'));

  if (correlationDirs.length === 0) {
    console.log('No correlation results found. Run Phase 4 first.');
    process.exit(1);
  }

  correlationDirs.sort().reverse();
  const latestDir = join(__dirname, correlationDirs[0]);
  const correlationFile = join(latestDir, 'spearman_correlation.json');

  if (!existsSync(correlationFile)) {
    console.log(`Correlation file not found: ${correlationFile}`);
    process.exit(1);
  }

  console.log(`Loading correlation data from: ${correlationFile}`);
  const correlationData = JSON.parse(readFileSync(correlationFile, 'utf-8'));

  const pairedData = correlationData.paired_data;
  console.log(`Paired scenarios: ${pairedData.length}`);

  // Separate Golden and Kill paths
  const goldenData = pairedData.filter(d => !d.scenario_id.includes('adversarial') && d.siva_crs > 3);
  const killData = pairedData.filter(d => d.siva_crs <= 3 || d.scenario_id.includes('adversarial'));

  // Statistics
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                      SUMMARY STATISTICS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const humanStats = computeStatistics(pairedData.map(d => d.human_crs));
  const sivaStats = computeStatistics(pairedData.map(d => d.siva_crs));

  console.log('  Human CRS:');
  console.log(`    Mean:     ${humanStats.mean.toFixed(3)}`);
  console.log(`    Std Dev:  ${humanStats.stdDev.toFixed(3)}`);
  console.log(`    Median:   ${humanStats.median.toFixed(3)}`);
  console.log(`    Range:    [${humanStats.min.toFixed(2)}, ${humanStats.max.toFixed(2)}]`);
  console.log(`    IQR:      [${humanStats.q1.toFixed(2)}, ${humanStats.q3.toFixed(2)}]`);

  console.log('\n  SIVA CRS:');
  console.log(`    Mean:     ${sivaStats.mean.toFixed(3)}`);
  console.log(`    Std Dev:  ${sivaStats.stdDev.toFixed(3)}`);
  console.log(`    Median:   ${sivaStats.median.toFixed(3)}`);
  console.log(`    Range:    [${sivaStats.min.toFixed(2)}, ${sivaStats.max.toFixed(2)}]`);
  console.log(`    IQR:      [${sivaStats.q1.toFixed(2)}, ${sivaStats.q3.toFixed(2)}]`);

  // Scatter plot
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                    SCATTER PLOT: Human vs SIVA CRS');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('\n  Legend: · = 1 point, o = 2-4 points, O = 5-9 points, ● = 10+ points');
  console.log('          ╲ = diagonal (perfect correlation line)\n');

  const plot = asciiScatterPlot(pairedData);
  console.log(plot);

  // Interpretation
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('                        INTERPRETATION');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const rho = correlationData.spearman.rho;

  console.log(`  Spearman's ρ = ${rho}`);
  console.log(`  Calibration:   ${correlationData.calibration_status}\n`);

  if (rho >= 0.5) {
    console.log('  ✅ Points cluster along diagonal');
    console.log('     Human and SIVA CRS are positively correlated.');
    console.log('     CRS captures meaningful sales judgment.\n');
  } else if (rho >= 0.3) {
    console.log('  ⚠️  Points show weak clustering');
    console.log('     Some correlation exists but it is weak.');
    console.log('     CRS may need tuning for reliable use.\n');
  } else {
    console.log('  ❌ Points are scattered');
    console.log('     Human and SIVA CRS show little correlation.');
    console.log('     CRS is essentially noise. Do not use for decisions.\n');
  }

  // Check for bias
  const meanDiff = humanStats.mean - sivaStats.mean;
  if (Math.abs(meanDiff) > 0.5) {
    console.log(`  ⚠️  BIAS DETECTED: Mean difference = ${meanDiff.toFixed(3)}`);
    if (meanDiff > 0) {
      console.log('     SIVA scores systematically lower than human scores.');
    } else {
      console.log('     SIVA scores systematically higher than human scores.');
    }
    console.log('     Consider bias correction if using CRS.\n');
  }

  // Check variance
  const varRatio = sivaStats.stdDev / humanStats.stdDev;
  if (varRatio < 0.5) {
    console.log('  ⚠️  VARIANCE ISSUE: SIVA CRS has lower variance than Human CRS');
    console.log('     SIVA may be "hedging" toward middle scores.');
    console.log('     Consider calibrating score ranges.\n');
  } else if (varRatio > 2) {
    console.log('  ⚠️  VARIANCE ISSUE: SIVA CRS has higher variance than Human CRS');
    console.log('     SIVA may be producing extreme scores too often.\n');
  }

  // Save distribution report
  const report = {
    validation_id: correlationData.validation_id,
    generated_at: new Date().toISOString(),
    statistics: {
      human: humanStats,
      siva: sivaStats,
      mean_difference: meanDiff,
      variance_ratio: varRatio,
    },
    spearman_rho: rho,
    calibration_status: correlationData.calibration_status,
    diagnostics: {
      has_bias: Math.abs(meanDiff) > 0.5,
      has_variance_issue: varRatio < 0.5 || varRatio > 2,
    },
  };

  const reportFile = join(latestDir, 'distribution_report.json');
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`Distribution report saved to: ${reportFile}`);

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        NEXT STEPS                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ Run Phase 6: Write silent memo (internal document)               ║');
  console.log('║   node silent-validation-phase6-memo.js                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
