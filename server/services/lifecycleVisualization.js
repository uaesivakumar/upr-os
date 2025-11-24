/**
 * Lifecycle State Machine Visualization
 * Generates visual diagrams of the state machine
 */

import { LifecycleStateEngine } from './lifecycleStateEngine.js';

export class LifecycleVisualization {
  constructor(engine) {
    this.engine = engine || new LifecycleStateEngine();
  }

  /**
   * Generate Mermaid diagram syntax
   */
  generateMermaidDiagram() {
    const graph = this.engine.getStateMachineGraph();

    let mermaid = 'stateDiagram-v2\n';
    mermaid += '    [*] --> DISCOVERED : New Opportunity\n\n';

    // Add state descriptions
    graph.nodes.forEach(node => {
      if (node.id !== 'DISCOVERED') {
        mermaid += `    ${node.id} : ${node.label}\n`;
      }
    });

    mermaid += '\n';

    // Add transitions
    graph.edges.forEach(edge => {
      const label = edge.label || '';
      if (label) {
        mermaid += `    ${edge.from} --> ${edge.to} : ${label}\n`;
      } else {
        mermaid += `    ${edge.from} --> ${edge.to}\n`;
      }
    });

    mermaid += '\n    CLOSED --> [*] : End\n';

    return mermaid;
  }

  /**
   * Generate ASCII art diagram
   */
  generateASCIIDiagram() {
    return `
┌─────────────────────────────────────────────────────────────────────┐
│                 OPPORTUNITY LIFECYCLE STATE MACHINE                  │
└─────────────────────────────────────────────────────────────────────┘

                            ┌──────────────┐
                            │  DISCOVERED  │ (Entry)
                            └──────┬───────┘
                                   │ Quality ≥ 70
                                   ▼
                            ┌──────────────┐
                      ┌────►│  QUALIFIED   │
                      │     └──────┬───────┘
                      │            │ 2h auto
                      │            ▼
                      │     ┌──────────────┐
                      │  ┌──┤   OUTREACH   │──┐ Max attempts
                      │  │  └──────┬───────┘  │
                      │  │         │ Response │
                      │  │         ▼          │
                      │  │  ┌──────────────┐  │
           Re-engage  │  └─►│   ENGAGED    │  │ 30d inactive
                      │     └──────┬───────┘  │
                      │            │ Proposal │
                      │            ▼          │
                      │     ┌──────────────┐  │
                      │  ┌─►│ NEGOTIATING  │  │ 14d stalled
                      │  │  └──────┬───────┘  │
                      │  │         │ Won/Lost │
                      │  │         ▼          │
                      │  │  ┌──────────────┐  │
                      │  │  │    CLOSED    │◄─┘
                      │  │  │  (Terminal)  │
                      │  │  └──────────────┘
                      │  │         ▲
                      │  └─────────┼─────── Back to discussion
                      │            │
                      │     ┌──────────────┐
                      └────►│   DORMANT    │
                            └──────────────┘
                               60d re-engage

States:
  • DISCOVERED  - Opportunity identified, not yet qualified
  • QUALIFIED   - Meets quality criteria, ready for outreach
  • OUTREACH    - Active outreach in progress
  • ENGAGED     - Prospect responding, showing interest
  • NEGOTIATING - Active deal negotiation
  • DORMANT     - Inactive, potential re-engagement
  • CLOSED      - Terminal (WON/LOST/DISQUALIFIED)
`;
  }

  /**
   * Generate detailed state information
   */
  generateStateDetails() {
    const states = this.engine.getStates();
    let details = '# Lifecycle States Details\n\n';

    states.forEach(state => {
      const config = this.engine.getStateConfig(state);
      const nextStates = this.engine.getValidNextStates(state);

      details += `## ${state}\n\n`;
      details += `**Description**: ${config.description}\n\n`;
      details += `**Properties**:\n`;
      details += `- Entry State: ${config.isEntry ? 'Yes' : 'No'}\n`;
      details += `- Terminal State: ${config.isTerminal ? 'Yes' : 'No'}\n`;
      details += `- Color: ${config.color}\n\n`;

      details += `**Auto Actions**:\n`;
      config.autoActions.forEach(action => {
        details += `- ${action}\n`;
      });
      details += '\n';

      details += `**Valid Transitions To**: ${nextStates.join(', ') || 'None'}\n\n`;
      details += '---\n\n';
    });

    return details;
  }

  /**
   * Generate transition matrix
   */
  generateTransitionMatrix() {
    const states = this.engine.getStates();
    let matrix = '# Transition Matrix\n\n';
    matrix += '| From \\ To | ' + states.join(' | ') + ' |\n';
    matrix += '|' + '---|'.repeat(states.length + 1) + '\n';

    states.forEach(fromState => {
      const row = [fromState];

      states.forEach(toState => {
        if (this.engine.isValidTransition(fromState, toState)) {
          row.push('✓');
        } else {
          row.push('-');
        }
      });

      matrix += '| ' + row.join(' | ') + ' |\n';
    });

    return matrix;
  }

  /**
   * Generate complete documentation
   */
  generateFullDocumentation() {
    return `# Opportunity Lifecycle State Machine - Complete Documentation

${this.generateASCIIDiagram()}

${this.generateStateDetails()}

${this.generateTransitionMatrix()}

## Mermaid Diagram

\`\`\`mermaid
${this.generateMermaidDiagram()}
\`\`\`

---
Generated: ${new Date().toISOString()}
`;
  }

  /**
   * Export diagram to file
   */
  exportToMarkdown(filePath = './lifecycle_diagram.md') {
    const fs = require('fs');
    const content = this.generateFullDocumentation();
    fs.writeFileSync(filePath, content);
    return filePath;
  }
}

export default LifecycleVisualization;
