import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORKSPACE_ID = process.env.NOTION_WORKSPACE_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Creating UPR Project Tracking Dashboard');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function createTrackingDashboard() {
  try {
    // Create a new page in the workspace
    const dashboardPage = await notion.pages.create({
      parent: {
        type: 'page_id',
        page_id: '2a2661510dd168f5a7a3c00a28f9e2bd' // UPR workspace root
      },
      icon: {
        type: 'emoji',
        emoji: '📊'
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: '🎯 UPR Project Tracking Dashboard [REDESIGN PREVIEW]'
              }
            }
          ]
        }
      },
      children: [
        // Header
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🎯 UPR Project Tracking Dashboard'
                }
              }
            ],
            color: 'blue'
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📌 PREVIEW: This is a redesigned tracking dashboard. Review before applying to main workspace.',
                  link: null
                }
              }
            ],
            icon: {
              type: 'emoji',
              emoji: '⚠️'
            },
            color: 'yellow_background'
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // Project Overview Section
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📈 Project Overview'
                }
              }
            ],
            color: 'blue'
          }
        },
        {
          object: 'block',
          type: 'column_list',
          column_list: {
            children: [
              {
                object: 'block',
                type: 'column',
                column: {
                  children: [
                    {
                      object: 'block',
                      type: 'callout',
                      callout: {
                        rich_text: [
                          {
                            type: 'text',
                            text: {
                              content: 'Current Sprint\n',
                              annotations: { bold: true }
                            }
                          },
                          {
                            type: 'text',
                            text: {
                              content: 'Sprint 20 - Complete ✅\n21/21 smoke tests passing'
                            }
                          }
                        ],
                        icon: { type: 'emoji', emoji: '🚀' },
                        color: 'green_background'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'column',
                column: {
                  children: [
                    {
                      object: 'block',
                      type: 'callout',
                      callout: {
                        rich_text: [
                          {
                            type: 'text',
                            text: {
                              content: 'Project Progress\n',
                              annotations: { bold: true }
                            }
                          },
                          {
                            type: 'text',
                            text: {
                              content: '50% Complete\nSIVA Phase 4 Done'
                            }
                          }
                        ],
                        icon: { type: 'emoji', emoji: '📊' },
                        color: 'blue_background'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'column',
                column: {
                  children: [
                    {
                      object: 'block',
                      type: 'callout',
                      callout: {
                        rich_text: [
                          {
                            type: 'text',
                            text: {
                              content: 'Next Sprint\n',
                              annotations: { bold: true }
                            }
                          },
                          {
                            type: 'text',
                            text: {
                              content: 'Sprint 21 - Planning\nSIVA Phase 5 Ready'
                            }
                          }
                        ],
                        icon: { type: 'emoji', emoji: '🎯' },
                        color: 'gray_background'
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // Quick Links Section
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🔗 Quick Links'
                }
              }
            ],
            color: 'blue'
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📅 Sprints Dashboard',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: ' - View all sprints, progress, and completion'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📋 MODULE FEATURES',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: ' - Track all features, phases, and tasks'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🧠 SIVA System Progress',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: ' - 12 phases, 12 tools operational'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📚 Documentation',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: ' - Auto-synced markdown docs (29 files)'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // Current Sprint Status
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🚀 Sprint 20 Status (COMPLETE)'
                }
              }
            ],
            color: 'green'
          }
        },
        {
          object: 'block',
          type: 'toggle',
          toggle: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📊 Test Results (Click to expand)',
                  annotations: { bold: true }
                }
              }
            ],
            children: [
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '✅ Smoke Tests: 21/21 passing (100%)'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '✅ Stress Tests: 0% error rate'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '⚡ Foundation Tools p95: 510ms'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '⚡ STRICT Tools p95: 308ms'
                      }
                    }
                  ]
                }
              },
              {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '⚡ DELEGATED Tools p95: 340ms'
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'toggle',
          toggle: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📦 Completed Tasks (Click to expand)',
                  annotations: { bold: true }
                }
              }
            ],
            children: [
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.1: REST API Layer (14 endpoints)'
                      }
                    }
                  ],
                  checked: true
                }
              },
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.2: Database Persistence (3 tables)'
                      }
                    }
                  ],
                  checked: true
                }
              },
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.3: Discovery Engine Integration'
                      }
                    }
                  ],
                  checked: true
                }
              },
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.4: Enrichment Engine Integration'
                      }
                    }
                  ],
                  checked: true
                }
              },
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.5: OpenTelemetry Monitoring'
                      }
                    }
                  ],
                  checked: true
                }
              },
              {
                object: 'block',
                type: 'to_do',
                to_do: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: 'Phase 4.6: Persona Policy Engine'
                      }
                    }
                  ],
                  checked: true
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // SIVA Phases Overview
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🧠 SIVA 12 Phases Progress'
                }
              }
            ],
            color: 'blue'
          }
        },
        {
          object: 'block',
          type: 'table',
          table: {
            table_width: 4,
            has_column_header: true,
            has_row_header: false,
            children: [
              // Header row
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase' } }],
                    [{ type: 'text', text: { content: 'Status' } }],
                    [{ type: 'text', text: { content: 'Progress' } }],
                    [{ type: 'text', text: { content: 'Sprint' } }]
                  ]
                }
              },
              // Phase 1
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase 1: Persona Extraction' } }],
                    [{ type: 'text', text: { content: 'To-Do' } }],
                    [{ type: 'text', text: { content: '0%' } }],
                    [{ type: 'text', text: { content: 'Sprint 21+' } }]
                  ]
                }
              },
              // Phase 2
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase 2: Cognitive Framework' } }],
                    [{ type: 'text', text: { content: 'In Progress' } }],
                    [{ type: 'text', text: { content: '30%' } }],
                    [{ type: 'text', text: { content: 'Sprint 17-20' } }]
                  ]
                }
              },
              // Phase 3
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase 3: Centralized Agentic Hub' } }],
                    [{ type: 'text', text: { content: 'To-Do' } }],
                    [{ type: 'text', text: { content: '0%' } }],
                    [{ type: 'text', text: { content: 'Sprint 21+' } }]
                  ]
                }
              },
              // Phase 4
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase 4: Infrastructure & Integration ✅' } }],
                    [{ type: 'text', text: { content: 'Complete' } }],
                    [{ type: 'text', text: { content: '100%' } }],
                    [{ type: 'text', text: { content: 'Sprint 20' } }]
                  ]
                }
              },
              // Phase 5
              {
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: [
                    [{ type: 'text', text: { content: 'Phase 5: Cognitive Extraction' } }],
                    [{ type: 'text', text: { content: 'To-Do' } }],
                    [{ type: 'text', text: { content: '0%' } }],
                    [{ type: 'text', text: { content: 'Sprint 21+' } }]
                  ]
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // Recommended Actions
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '⚡ Recommended Changes'
                }
              }
            ],
            color: 'orange'
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🔧 Database Cleanup Needed:\n',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: '1. Delete duplicate "Phase 3: RADAR Multi-Source Orchestration"\n'
                }
              },
              {
                type: 'text',
                text: {
                  content: '2. Keep original "Phase 3: Centralized Agentic Hub Design"\n'
                }
              },
              {
                type: 'text',
                text: {
                  content: '3. All Phase 3.1-3.6 and Phase 4.1-4.6 subtasks are correct (no changes)'
                }
              }
            ],
            icon: {
              type: 'emoji',
              emoji: '⚠️'
            },
            color: 'yellow_background'
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📊 Views to Add:\n',
                  annotations: { bold: true }
                }
              },
              {
                type: 'text',
                text: {
                  content: '1. Sprints: Timeline view showing project progression\n'
                }
              },
              {
                type: 'text',
                text: {
                  content: '2. MODULE FEATURES: By Status, By Sprint, By Phase views\n'
                }
              },
              {
                type: 'text',
                text: {
                  content: '3. Modules: Progress tracking with % complete formulas'
                }
              }
            ],
            icon: {
              type: 'emoji',
              emoji: '💡'
            },
            color: 'blue_background'
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },

        // Footer
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📝 Note: This is a preview dashboard. Review and approve before applying changes to main workspace.',
                  annotations: { italic: true }
                }
              }
            ],
            icon: {
              type: 'emoji',
              emoji: 'ℹ️'
            },
            color: 'gray_background'
          }
        }
      ]
    });

    console.log('✅ Dashboard created successfully!');
    console.log(`\n🔗 View dashboard: https://notion.so/${dashboardPage.id.replace(/-/g, '')}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error creating dashboard:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

createTrackingDashboard().catch(console.error);
