# GCP Monitoring Setup Guide for UPR

**Version**: 1.0.0
**Last Updated**: 2025-11-19
**GCP Project**: applied-algebra-474804-e6
**Service**: upr-web-service
**Region**: us-central1

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Prerequisites](#prerequisites)
4. [Dashboard 1: Application Health](#dashboard-1-application-health)
5. [Dashboard 2: Business Metrics](#dashboard-2-business-metrics)
6. [Dashboard 3: Database Performance](#dashboard-3-database-performance)
7. [Dashboard 4: Security Monitoring](#dashboard-4-security-monitoring)
8. [Log-Based Metrics](#log-based-metrics)
9. [Custom Metrics](#custom-metrics)
10. [Alert Policies](#alert-policies)
11. [Notification Channels](#notification-channels)
12. [Dashboard JSON Templates](#dashboard-json-templates)
13. [Monitoring Best Practices](#monitoring-best-practices)
14. [Troubleshooting](#troubleshooting)

---

## Overview

### Monitoring Strategy

The UPR monitoring system follows a **four-pillar approach** to ensure comprehensive observability:

1. **Application Health**: Service uptime, latency, errors, and request patterns
2. **Business Metrics**: Lead enrichment quality, scoring engine performance, agent decisions
3. **Database Performance**: Connection pooling, query performance, locks, and replication lag
4. **Security Monitoring**: Authentication failures, rate limiting, anomalous access patterns

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GCP Cloud Monitoring                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Cloud Run    │  │ Cloud SQL    │  │ Cloud Trace  │      │
│  │ Metrics      │  │ Metrics      │  │ (OpenTelemetry)│    │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Log-Based    │  │ Custom       │  │ Prometheus   │      │
│  │ Metrics      │  │ Metrics      │  │ Metrics      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Alert Policies (12 rules)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Notification Channels (Email, Slack, PagerDuty)│   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Metrics Summary

| Category | Metric | Threshold | Alert Level |
|----------|--------|-----------|-------------|
| **Availability** | Service Uptime | < 99% | P0 Critical |
| **Performance** | P95 Latency | > 2s | P1 High |
| **Errors** | Error Rate | > 2% | P1 High |
| **Database** | Connection Pool Usage | > 80% | P2 Medium |
| **Business** | Enrichment Failure Rate | > 5% | P2 Medium |
| **Security** | Auth Failure Rate | > 10/min | P1 High |

---

## Quick Start

### 1. One-Command Setup (Recommended)

```bash
# Set project
gcloud config set project applied-algebra-474804-e6

# Run automated setup
./scripts/monitoring/setup-all-monitoring.sh
```

### 2. Verify Setup

```bash
# List dashboards
gcloud monitoring dashboards list --format="table(displayName,etag)"

# List alert policies
gcloud alpha monitoring policies list --format="table(displayName,enabled)"

# Test notification channels
gcloud alpha monitoring channels list
```

### 3. Access Dashboards

- **Cloud Console**: https://console.cloud.google.com/monitoring/dashboards?project=applied-algebra-474804-e6
- **Direct Links** (after setup):
  - Application Health: See [Dashboard 1](#dashboard-1-application-health)
  - Business Metrics: See [Dashboard 2](#dashboard-2-business-metrics)
  - Database Performance: See [Dashboard 3](#dashboard-3-database-performance)
  - Security Monitoring: See [Dashboard 4](#dashboard-4-security-monitoring)

---

## Prerequisites

### 1. Install gcloud CLI

```bash
# macOS
brew install --cask google-cloud-sdk

# Verify installation
gcloud version
```

### 2. Authenticate & Configure

```bash
# Login to GCP
gcloud auth login

# Set project
gcloud config set project applied-algebra-474804-e6

# Verify configuration
gcloud config list
```

### 3. Enable Required APIs

```bash
# Enable Cloud Monitoring API
gcloud services enable monitoring.googleapis.com

# Enable Cloud Logging API
gcloud services enable logging.googleapis.com

# Enable Cloud Trace API
gcloud services enable cloudtrace.googleapis.com

# Verify APIs are enabled
gcloud services list --enabled | grep -E "monitoring|logging|trace"
```

### 4. Grant IAM Permissions

```bash
# Your user needs these roles:
# - Monitoring Admin (roles/monitoring.admin)
# - Logging Admin (roles/logging.admin)
# - Service Account User (roles/iam.serviceAccountUser)

# Check your permissions
gcloud projects get-iam-policy applied-algebra-474804-e6 \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:$(gcloud config get-value account)"
```

---

## Dashboard 1: Application Health

### Overview

Monitors the health and performance of the Cloud Run service `upr-web-service`.

**Key Metrics**:
- Service uptime and availability
- Request rate (requests/second)
- Latency percentiles (P50, P95, P99)
- Error rate and error types
- Container CPU and memory usage
- Instance count and autoscaling

### Create Dashboard

```bash
# Create dashboard from JSON template
gcloud monitoring dashboards create --config-from-file=- <<'EOF'
{
  "displayName": "UPR - Application Health",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Service Availability (Last 24h)",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_RATE"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_LINE"
            }
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Rate (req/s)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Requests/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 4,
        "width": 12,
        "height": 4,
        "widget": {
          "title": "Request Latency (P50, P95, P99)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA",
                      "crossSeriesReducer": "REDUCE_PERCENTILE_50"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "P50"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA",
                      "crossSeriesReducer": "REDUCE_PERCENTILE_95"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "P95"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA",
                      "crossSeriesReducer": "REDUCE_PERCENTILE_99"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "P99"
              }
            ],
            "yAxis": {
              "label": "Latency (ms)",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 500,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 2000,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "yPos": 8,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Error Rate (%)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Error Rate",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.005,
                "color": "YELLOW",
                "direction": "ABOVE",
                "label": "Warning (0.5%)"
              },
              {
                "value": 0.02,
                "color": "RED",
                "direction": "ABOVE",
                "label": "Critical (2%)"
              }
            ]
          }
        }
      },
      {
        "yPos": 8,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Container CPU Utilization",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/container/cpu/utilizations\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN",
                      "crossSeriesReducer": "REDUCE_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "CPU Usage",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.7,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.9,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "yPos": 12,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Container Memory Utilization",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN",
                      "crossSeriesReducer": "REDUCE_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Memory Usage",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.8,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.95,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "yPos": 12,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Active Container Instances",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/container/instance_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MAX",
                      "crossSeriesReducer": "REDUCE_SUM"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Instances",
              "scale": "LINEAR"
            }
          }
        }
      }
    ]
  }
}
EOF
```

### Query Examples

```bash
# Check current request rate
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="upr-web-service"' \
  --format="table(metric.type, points[].value)" \
  --project=applied-algebra-474804-e6

# Get P95 latency for last hour
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="upr-web-service"' \
  --start-time="$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --format="table(metric.type, points[].value)" \
  --project=applied-algebra-474804-e6

# Count errors in last 24 hours
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="upr-web-service" AND severity>=ERROR' \
  --limit=1000 \
  --format="value(timestamp)" \
  --project=applied-algebra-474804-e6 | wc -l
```

---

## Dashboard 2: Business Metrics

### Overview

Tracks business-critical metrics related to lead enrichment, scoring, and agent decisions.

**Key Metrics**:
- Lead enrichment success/failure rate
- Email discovery rate
- Lead score distribution
- Agent decision consensus rate
- Lifecycle state transitions
- Enrichment source performance (Apollo, Hunter)

### Create Dashboard

```bash
gcloud monitoring dashboards create --config-from-file=- <<'EOF'
{
  "displayName": "UPR - Business Metrics",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Lead Enrichment Success Rate (24h)",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/lead_enrichment_success\"",
                "aggregation": {
                  "alignmentPeriod": "86400s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_MEAN"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_BAR"
            },
            "thresholds": [
              {
                "value": 0.95,
                "color": "GREEN",
                "direction": "ABOVE"
              },
              {
                "value": 0.90,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.90,
                "color": "RED",
                "direction": "BELOW"
              }
            ]
          }
        }
      },
      {
        "xPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Email Discovery Rate",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/email_discovered\"",
                "aggregation": {
                  "alignmentPeriod": "3600s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_MEAN"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_LINE"
            }
          }
        }
      },
      {
        "xPos": 8,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Agent Consensus Rate",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/agent_consensus_achieved\"",
                "aggregation": {
                  "alignmentPeriod": "3600s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_MEAN"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_BAR"
            }
          }
        }
      },
      {
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Lead Score Distribution",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/lead_score_calculated\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_MEAN",
                      "groupByFields": ["metric.label.score_tier"]
                    }
                  }
                },
                "plotType": "STACKED_BAR"
              }
            ],
            "yAxis": {
              "label": "Count",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 4,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Lifecycle State Transitions",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/lifecycle_state_transition\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "groupByFields": ["metric.label.to_state"]
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Transitions/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 8,
        "width": 12,
        "height": 4,
        "widget": {
          "title": "Enrichment Source Performance (Apollo vs Hunter)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/enrichment_source_latency\" AND metric.labels.source=\"apollo\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Apollo"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/enrichment_source_latency\" AND metric.labels.source=\"hunter\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Hunter"
              }
            ],
            "yAxis": {
              "label": "Latency (ms)",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 12,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Agent Decision Types",
          "pieChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/agent_decision\"",
                    "aggregation": {
                      "alignmentPeriod": "3600s",
                      "perSeriesAligner": "ALIGN_SUM",
                      "groupByFields": ["metric.label.decision_type"]
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        "yPos": 12,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "SIVA Tool Execution Count (Top 10)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/siva/tool_executions\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "groupByFields": ["metric.label.tool_name"]
                    }
                  }
                },
                "plotType": "STACKED_AREA"
              }
            ],
            "yAxis": {
              "label": "Executions/sec",
              "scale": "LINEAR"
            }
          }
        }
      }
    ]
  }
}
EOF
```

### Business Metrics Queries

```bash
# Count successful enrichments today
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND jsonPayload.message=~"Lead enriched successfully"
   AND timestamp>="'$(date -u +%Y-%m-%dT00:00:00Z)'"' \
  --format="value(timestamp)" \
  --project=applied-algebra-474804-e6 | wc -l

# Agent decisions in last hour
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND jsonPayload.agent_decision_type!=""
   AND timestamp>="'$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --format="table(timestamp, jsonPayload.agent_decision_type, jsonPayload.confidence)" \
  --limit=100 \
  --project=applied-algebra-474804-e6

# Lead score distribution
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND jsonPayload.lead_score>0
   AND timestamp>="'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --format="csv(jsonPayload.lead_score)" \
  --limit=1000 \
  --project=applied-algebra-474804-e6 | \
  awk -F',' '{if(NR>1) print $1}' | \
  sort -n | \
  uniq -c
```

---

## Dashboard 3: Database Performance

### Overview

Monitors Cloud SQL PostgreSQL instance `upr-postgres` performance and health.

**Key Metrics**:
- Active connections and connection pool usage
- Query latency (read/write)
- Transaction rate
- Replication lag (if using read replicas)
- Disk I/O and utilization
- Slow query count

### Create Dashboard

```bash
gcloud monitoring dashboards create --config-from-file=- <<'EOF'
{
  "displayName": "UPR - Database Performance",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Database CPU Utilization",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "CPU %",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.7,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.9,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "xPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Database Memory Utilization",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/memory/utilization\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Memory %",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.8,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.95,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "xPos": 8,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Active Connections",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Connections",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 80,
                "color": "YELLOW",
                "direction": "ABOVE",
                "label": "80% of max (100)"
              },
              {
                "value": 95,
                "color": "RED",
                "direction": "ABOVE",
                "label": "95% of max"
              }
            ]
          }
        }
      },
      {
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Transaction Rate (commits/rollbacks)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/transaction_count\" AND metric.labels.transaction_type=\"commit\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Commits"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/transaction_count\" AND metric.labels.transaction_type=\"rollback\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Rollbacks"
              }
            ],
            "yAxis": {
              "label": "Transactions/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 4,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Disk I/O Operations",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/disk/read_ops_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Read Ops"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/disk/write_ops_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Write Ops"
              }
            ],
            "yAxis": {
              "label": "Operations/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 8,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Disk Utilization",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/disk/utilization\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Disk %",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.8,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.9,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "yPos": 8,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Replication Lag (if applicable)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"applied-algebra-474804-e6:upr-postgres\" AND metric.type=\"cloudsql.googleapis.com/database/replication/replica_lag\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Lag (seconds)",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 10,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 60,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "yPos": 12,
        "width": 12,
        "height": 4,
        "widget": {
          "title": "Slow Query Count (>1s)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND metric.type=\"logging.googleapis.com/user/slow_query_count\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_SUM"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Count",
              "scale": "LINEAR"
            }
          }
        }
      }
    ]
  }
}
EOF
```

### Database Queries

```bash
# Check database CPU and memory
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(settings.tier, settings.dataDiskSizeGb, state)"

# Get current connections (requires psql access)
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT count(*) as active_connections,
             max(now() - query_start) as longest_query,
             count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = 'upr_production';"

# Find slow queries in logs
gcloud logging read \
  'resource.type="cloudsql_database"
   AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
   AND jsonPayload.message=~"duration:.*ms"
   AND jsonPayload.message=~"duration: [1-9][0-9]{3,}"' \
  --limit=50 \
  --format="table(timestamp, jsonPayload.message)" \
  --project=applied-algebra-474804-e6

# Table sizes
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY size_bytes DESC
      LIMIT 20;"
```

---

## Dashboard 4: Security Monitoring

### Overview

Tracks security-related events including authentication failures, rate limiting, and anomalous access patterns.

**Key Metrics**:
- Authentication failures (JWT validation errors)
- Rate limit hits by endpoint
- Suspicious IP addresses (high error rates)
- API key usage patterns
- CORS violations
- SQL injection attempts (detected in logs)

### Create Dashboard

```bash
gcloud monitoring dashboards create --config-from-file=- <<'EOF'
{
  "displayName": "UPR - Security Monitoring",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Authentication Failures (JWT)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/auth_failure\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "groupByFields": ["metric.label.failure_reason"]
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Failures/sec",
              "scale": "LINEAR"
            },
            "thresholds": [
              {
                "value": 0.17,
                "color": "YELLOW",
                "direction": "ABOVE",
                "label": "10/min"
              },
              {
                "value": 0.5,
                "color": "RED",
                "direction": "ABOVE",
                "label": "30/min"
              }
            ]
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Rate Limit Hits by Endpoint",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/rate_limit_exceeded\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "groupByFields": ["metric.label.endpoint"]
                    }
                  }
                },
                "plotType": "STACKED_AREA"
              }
            ],
            "yAxis": {
              "label": "Hits/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 4,
        "width": 12,
        "height": 4,
        "widget": {
          "title": "4xx Client Errors by Endpoint",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"4xx\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "groupByFields": ["metric.label.response_code"]
                    }
                  }
                },
                "plotType": "STACKED_BAR"
              }
            ],
            "yAxis": {
              "label": "Errors/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "yPos": 8,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Top IPs by Error Rate",
          "logsPanel": {
            "resourceNames": [
              "projects/applied-algebra-474804-e6"
            ],
            "filter": "resource.type=\"cloud_run_revision\"\nresource.labels.service_name=\"upr-web-service\"\nseverity>=ERROR"
          }
        }
      },
      {
        "yPos": 8,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Suspicious Activity Alerts",
          "logsPanel": {
            "resourceNames": [
              "projects/applied-algebra-474804-e6"
            ],
            "filter": "resource.type=\"cloud_run_revision\"\nresource.labels.service_name=\"upr-web-service\"\n(jsonPayload.message=~\"SQL injection\" OR jsonPayload.message=~\"XSS attempt\" OR jsonPayload.message=~\"Unauthorized access\")"
          }
        }
      },
      {
        "yPos": 12,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "API Key Usage by Key ID",
          "pieChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/api_key_usage\"",
                    "aggregation": {
                      "alignmentPeriod": "3600s",
                      "perSeriesAligner": "ALIGN_SUM",
                      "groupByFields": ["metric.label.key_id"]
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        "yPos": 12,
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "CORS Violations",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/cors_violation\"",
                    "aggregation": {
                      "alignmentPeriod": "300s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ],
            "yAxis": {
              "label": "Violations/sec",
              "scale": "LINEAR"
            }
          }
        }
      }
    ]
  }
}
EOF
```

### Security Queries

```bash
# Recent authentication failures
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND (jsonPayload.message=~"Authentication failed" OR jsonPayload.message=~"Invalid token")
   AND timestamp>="'$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --limit=50 \
  --format="table(timestamp, httpRequest.remoteIp, jsonPayload.message)" \
  --project=applied-algebra-474804-e6

# Rate limit violations
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND jsonPayload.message=~"Rate limit exceeded"
   AND timestamp>="'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --limit=100 \
  --format="table(timestamp, httpRequest.remoteIp, jsonPayload.endpoint)" \
  --project=applied-algebra-474804-e6

# Failed login attempts by IP
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND httpRequest.status>=400
   AND timestamp>="'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --format="csv(httpRequest.remoteIp, httpRequest.status)" \
  --limit=10000 \
  --project=applied-algebra-474804-e6 | \
  awk -F',' '{if(NR>1) print $1}' | \
  sort | \
  uniq -c | \
  sort -rn | \
  head -20

# Detect SQL injection attempts
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND (jsonPayload.query=~".*DROP.*TABLE.*" OR jsonPayload.query=~".*OR.*1.*=.*1.*")
   AND timestamp>="'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)'"' \
  --limit=100 \
  --format="table(timestamp, httpRequest.remoteIp, jsonPayload.query)" \
  --project=applied-algebra-474804-e6
```

---

## Log-Based Metrics

### Overview

Log-based metrics allow you to extract numeric values from log entries and use them in dashboards and alerts.

### Create Log-Based Metrics

```bash
# 1. Lead Enrichment Success Metric
gcloud logging metrics create lead_enrichment_success \
  --description="Count of successful lead enrichments" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.message=~"Lead enriched successfully"' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --project=applied-algebra-474804-e6

# 2. Lead Enrichment Failure Metric
gcloud logging metrics create lead_enrichment_failure \
  --description="Count of failed lead enrichments" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.message=~"Lead enrichment failed"' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --project=applied-algebra-474804-e6

# 3. Email Discovery Success Metric
gcloud logging metrics create email_discovered \
  --description="Count of successful email discoveries" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.email_found=true' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --project=applied-algebra-474804-e6

# 4. Agent Consensus Achieved Metric
gcloud logging metrics create agent_consensus_achieved \
  --description="Count of agent consensus decisions" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.consensus_reached=true' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --project=applied-algebra-474804-e6

# 5. Lead Score Calculated Metric (with labels)
gcloud logging metrics create lead_score_calculated \
  --description="Lead scores calculated by tier" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.lead_score_calculated=true' \
  --value-extractor='EXTRACT(jsonPayload.lead_score)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --label-extractors='score_tier=EXTRACT(jsonPayload.score_tier)' \
  --project=applied-algebra-474804-e6

# 6. Authentication Failure Metric
gcloud logging metrics create auth_failure \
  --description="Authentication failures with reason" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND (jsonPayload.message=~"Authentication failed" OR jsonPayload.message=~"Invalid token")' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --label-extractors='failure_reason=EXTRACT(jsonPayload.error_type)' \
  --project=applied-algebra-474804-e6

# 7. Rate Limit Exceeded Metric
gcloud logging metrics create rate_limit_exceeded \
  --description="Rate limit violations by endpoint" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.message=~"Rate limit exceeded"' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --label-extractors='endpoint=EXTRACT(httpRequest.requestUrl)' \
  --project=applied-algebra-474804-e6

# 8. Slow Query Count Metric
gcloud logging metrics create slow_query_count \
  --description="Database queries taking >1 second" \
  --log-filter='resource.type="cloudsql_database"
               AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
               AND jsonPayload.message=~"duration: [1-9][0-9]{3,}"' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --project=applied-algebra-474804-e6

# 9. Agent Decision Type Metric
gcloud logging metrics create agent_decision \
  --description="Agent decisions by type" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.agent_decision_type!=""' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --label-extractors='decision_type=EXTRACT(jsonPayload.agent_decision_type)' \
  --project=applied-algebra-474804-e6

# 10. Lifecycle State Transition Metric
gcloud logging metrics create lifecycle_state_transition \
  --description="Lifecycle state changes" \
  --log-filter='resource.type="cloud_run_revision"
               AND resource.labels.service_name="upr-web-service"
               AND jsonPayload.lifecycle_transition=true' \
  --value-extractor='EXTRACT(1)' \
  --metric-kind=DELTA \
  --value-type=INT64 \
  --label-extractors='from_state=EXTRACT(jsonPayload.from_state),to_state=EXTRACT(jsonPayload.to_state)' \
  --project=applied-algebra-474804-e6
```

### List and Verify Metrics

```bash
# List all log-based metrics
gcloud logging metrics list --project=applied-algebra-474804-e6

# Describe a specific metric
gcloud logging metrics describe lead_enrichment_success \
  --project=applied-algebra-474804-e6

# Delete a metric (if needed)
gcloud logging metrics delete lead_enrichment_success \
  --project=applied-algebra-474804-e6 \
  --quiet
```

---

## Custom Metrics

### Overview

The UPR application exports custom metrics via Prometheus (Agent Hub) and OpenTelemetry (SIVA Tools) to GCP Cloud Monitoring.

### Prometheus Metrics (Agent Hub)

The Agent Hub exports the following metrics on `/metrics` endpoint:

```javascript
// Tool Execution Metrics
agent_hub_tool_executions_total{tool_name, status}
agent_hub_tool_execution_duration_ms{tool_name, status}

// Workflow Metrics
agent_hub_workflow_executions_total{workflow_name, status}
agent_hub_workflow_execution_duration_ms{workflow_name, status}
agent_hub_workflow_steps_total{workflow_name, step_id, status}

// Circuit Breaker Metrics
agent_hub_circuit_breaker_state{tool_name}  // 0=CLOSED, 1=HALF_OPEN, 2=OPEN
agent_hub_circuit_breaker_state_changes_total{tool_name, from_state, to_state}

// MCP Metrics
agent_hub_mcp_requests_total{method, status}
agent_hub_mcp_request_duration_ms{method}

// Registry Metrics
agent_hub_tool_registry_size
agent_hub_tool_health_check_failures_total{tool_name}
```

### OpenTelemetry Metrics (SIVA Tools)

SIVA tools are instrumented with OpenTelemetry and export to Cloud Trace:

```javascript
// Tool Latency
siva.tool.latency{tool, layer, success}

// Tool Errors
siva.tool.errors{tool, layer, error_type}

// Custom Attributes in Spans
siva.tool.name
siva.tool.layer  // foundation, strict, delegated
siva.tool.primitive  // assess, compare, decide, etc.
siva.tool.success
siva.tool.score
siva.tool.confidence
```

### Query Custom Metrics

```bash
# Query Prometheus metrics (if exposed)
curl https://upr-web-service-191599223867.us-central1.run.app/metrics

# Query OpenTelemetry traces in Cloud Trace
gcloud trace list-traces \
  --limit=50 \
  --project=applied-algebra-474804-e6 \
  --filter='has:siva.tool.name'

# Get specific trace details
gcloud trace get-trace TRACE_ID \
  --project=applied-algebra-474804-e6
```

### Create Custom Metric Descriptor (if needed)

```bash
# Example: Create enrichment source latency metric
gcloud monitoring metrics-descriptors create \
  custom.googleapis.com/enrichment/source_latency \
  --display-name="Enrichment Source Latency" \
  --description="Latency of enrichment API calls by source" \
  --metric-kind=GAUGE \
  --value-type=DOUBLE \
  --unit="ms" \
  --labels="source=Source name (apollo/hunter)" \
  --project=applied-algebra-474804-e6
```

---

## Alert Policies

### Overview

Alert policies notify you when metrics cross defined thresholds. Configure alerts for critical, high, medium, and low priority incidents.

### Critical Alerts (P0)

#### 1. Service Down Alert

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P0] UPR Service Down" \
  --condition-display-name="Service not responding to health checks" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision"
                      AND resource.labels.service_name="upr-web-service"
                      AND metric.type="run.googleapis.com/request_count"' \
  --condition-absent-duration=300s \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 2. Database Connection Failure

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P0] Database Connection Pool Exhausted" \
  --condition-display-name="Active connections > 95" \
  --condition-threshold-value=95 \
  --condition-threshold-duration=180s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloudsql_database"
                      AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
                      AND metric.type="cloudsql.googleapis.com/database/postgresql/num_backends"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 3. High Error Rate

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P0] Critical Error Rate >5%" \
  --condition-display-name="5xx errors exceed 5% of requests" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND resource.labels.service_name="upr-web-service"
                      AND metric.type="run.googleapis.com/request_count"
                      AND metric.labels.response_code_class="5xx"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

### High Priority Alerts (P1)

#### 4. High Latency Alert

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P1] High Request Latency >2s" \
  --condition-display-name="P95 latency exceeds 2 seconds" \
  --condition-threshold-value=2000 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND resource.labels.service_name="upr-web-service"
                      AND metric.type="run.googleapis.com/request_latencies"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_DELTA","crossSeriesReducer":"REDUCE_PERCENTILE_95"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 5. Authentication Failure Spike

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P1] Authentication Failure Spike" \
  --condition-display-name="Auth failures >10/min" \
  --condition-threshold-value=10 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND metric.type="logging.googleapis.com/user/auth_failure"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 6. Database CPU High

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P1] Database CPU >90%" \
  --condition-display-name="Database CPU utilization exceeds 90%" \
  --condition-threshold-value=0.9 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloudsql_database"
                      AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
                      AND metric.type="cloudsql.googleapis.com/database/cpu/utilization"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

### Medium Priority Alerts (P2)

#### 7. Lead Enrichment Failure Rate High

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P2] Lead Enrichment Failure Rate >10%" \
  --condition-display-name="Enrichment failures exceed 10% of attempts" \
  --condition-threshold-value=0.1 \
  --condition-threshold-duration=600s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND metric.type="logging.googleapis.com/user/lead_enrichment_failure"' \
  --aggregation='{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_RATE"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 8. Disk Utilization Warning

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P2] Database Disk >80%" \
  --condition-display-name="Database disk utilization exceeds 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=600s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloudsql_database"
                      AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
                      AND metric.type="cloudsql.googleapis.com/database/disk/utilization"' \
  --aggregation='{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_MEAN"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 9. Slow Query Count High

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P2] Slow Query Count >10/min" \
  --condition-display-name="Slow queries (>1s) exceed 10 per minute" \
  --condition-threshold-value=10 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloudsql_database"
                      AND metric.type="logging.googleapis.com/user/slow_query_count"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

### Informational Alerts (P3)

#### 10. Container Memory Warning

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P3] Container Memory >80%" \
  --condition-display-name="Container memory exceeds 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=600s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND resource.labels.service_name="upr-web-service"
                      AND metric.type="run.googleapis.com/container/memory/utilizations"' \
  --aggregation='{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_MEAN"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 11. Rate Limit Hits Increasing

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P3] Rate Limit Hits Increasing" \
  --condition-display-name="Rate limit violations >5/min" \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s \
  --condition-comparison=COMPARISON_GT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND metric.type="logging.googleapis.com/user/rate_limit_exceeded"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

#### 12. Agent Consensus Rate Low

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="[P3] Agent Consensus Rate <80%" \
  --condition-display-name="Agent consensus rate drops below 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=1800s \
  --condition-comparison=COMPARISON_LT \
  --condition-filter='resource.type="cloud_run_revision"
                      AND metric.type="logging.googleapis.com/user/agent_consensus_achieved"' \
  --aggregation='{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_RATE"}' \
  --combiner=OR \
  --project=applied-algebra-474804-e6
```

### List and Manage Alert Policies

```bash
# List all alert policies
gcloud alpha monitoring policies list \
  --format="table(displayName,enabled,conditions[0].displayName)" \
  --project=applied-algebra-474804-e6

# Get policy details
gcloud alpha monitoring policies describe POLICY_NAME \
  --project=applied-algebra-474804-e6

# Disable an alert policy
gcloud alpha monitoring policies update POLICY_NAME \
  --no-enabled \
  --project=applied-algebra-474804-e6

# Delete an alert policy
gcloud alpha monitoring policies delete POLICY_NAME \
  --project=applied-algebra-474804-e6 \
  --quiet
```

---

## Notification Channels

### Overview

Notification channels define where alerts are sent (email, Slack, PagerDuty, etc.).

### Create Notification Channels

#### Email Channel

```bash
gcloud alpha monitoring channels create \
  --display-name="UPR Ops Team Email" \
  --type=email \
  --channel-labels=email_address=ops@example.com \
  --project=applied-algebra-474804-e6
```

#### Slack Channel

```bash
# First, set up Slack integration in GCP Console:
# https://console.cloud.google.com/monitoring/alerting/notifications?project=applied-algebra-474804-e6

# Then create channel via CLI
gcloud alpha monitoring channels create \
  --display-name="UPR Ops Slack" \
  --type=slack \
  --channel-labels=channel_name=#upr-alerts,url=https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  --project=applied-algebra-474804-e6
```

#### PagerDuty Channel

```bash
gcloud alpha monitoring channels create \
  --display-name="UPR PagerDuty" \
  --type=pagerduty \
  --channel-labels=service_key=YOUR_PAGERDUTY_INTEGRATION_KEY \
  --project=applied-algebra-474804-e6
```

#### SMS Channel

```bash
gcloud alpha monitoring channels create \
  --display-name="UPR On-Call SMS" \
  --type=sms \
  --channel-labels=number=+1234567890 \
  --project=applied-algebra-474804-e6
```

### List Notification Channels

```bash
# List all channels
gcloud alpha monitoring channels list \
  --format="table(displayName,type,labels)" \
  --project=applied-algebra-474804-e6

# Get channel ID for use in alert policies
gcloud alpha monitoring channels list \
  --filter="displayName='UPR Ops Team Email'" \
  --format="value(name)" \
  --project=applied-algebra-474804-e6
```

### Update Notification Channel

```bash
# Update email address
gcloud alpha monitoring channels update CHANNEL_ID \
  --update-channel-labels=email_address=newemail@example.com \
  --project=applied-algebra-474804-e6
```

### Test Notification Channel

```bash
# Send test notification
gcloud alpha monitoring channels verify CHANNEL_ID \
  --project=applied-algebra-474804-e6
```

---

## Dashboard JSON Templates

### Complete Dashboard JSON Files

For easy import, save these JSON templates and import via:

```bash
gcloud monitoring dashboards create --config-from-file=dashboard.json
```

### Template: Application Health Dashboard

Save as `dashboard-app-health.json`:

```json
{
  "displayName": "UPR - Application Health (Complete)",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Uptime (99.5% SLA)",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\"",
                "aggregation": {
                  "alignmentPeriod": "86400s",
                  "perSeriesAligner": "ALIGN_DELTA",
                  "crossSeriesReducer": "REDUCE_COUNT"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_LINE"
            },
            "thresholds": [
              {
                "value": 0.995,
                "color": "GREEN",
                "direction": "ABOVE"
              }
            ]
          }
        }
      },
      {
        "xPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Request Rate",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_SUM"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_BAR"
            }
          }
        }
      },
      {
        "xPos": 8,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Error Rate",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"upr-web-service\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
                "aggregation": {
                  "alignmentPeriod": "300s",
                  "perSeriesAligner": "ALIGN_RATE",
                  "crossSeriesReducer": "REDUCE_SUM"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_LINE"
            },
            "thresholds": [
              {
                "value": 0.005,
                "color": "YELLOW",
                "direction": "ABOVE"
              },
              {
                "value": 0.02,
                "color": "RED",
                "direction": "ABOVE"
              }
            ]
          }
        }
      }
    ]
  }
}
```

### Import All Dashboards Script

Save as `/Users/skc/DataScience/upr/scripts/monitoring/import-dashboards.sh`:

```bash
#!/bin/bash

# Import all monitoring dashboards
# Usage: ./import-dashboards.sh

set -e

PROJECT_ID="applied-algebra-474804-e6"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Importing UPR monitoring dashboards to project: $PROJECT_ID"

# 1. Application Health
echo "[1/4] Importing Application Health dashboard..."
gcloud monitoring dashboards create \
  --config-from-file="${SCRIPT_DIR}/dashboards/app-health.json" \
  --project="$PROJECT_ID"

# 2. Business Metrics
echo "[2/4] Importing Business Metrics dashboard..."
gcloud monitoring dashboards create \
  --config-from-file="${SCRIPT_DIR}/dashboards/business-metrics.json" \
  --project="$PROJECT_ID"

# 3. Database Performance
echo "[3/4] Importing Database Performance dashboard..."
gcloud monitoring dashboards create \
  --config-from-file="${SCRIPT_DIR}/dashboards/database-performance.json" \
  --project="$PROJECT_ID"

# 4. Security Monitoring
echo "[4/4] Importing Security Monitoring dashboard..."
gcloud monitoring dashboards create \
  --config-from-file="${SCRIPT_DIR}/dashboards/security-monitoring.json" \
  --project="$PROJECT_ID"

echo ""
echo "✅ All dashboards imported successfully!"
echo ""
echo "View dashboards at:"
echo "https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
```

---

## Monitoring Best Practices

### 1. Dashboard Organization

- **Use consistent naming**: Prefix all dashboards with "UPR - "
- **Group related metrics**: Keep similar metrics on same dashboard
- **Set meaningful thresholds**: Use yellow (warning) and red (critical) lines
- **Add context**: Include descriptions and documentation links

### 2. Alert Configuration

- **Avoid alert fatigue**: Set appropriate thresholds to minimize false positives
- **Use duration windows**: Require condition to persist (e.g., 5 minutes) before alerting
- **Implement escalation**: P3 → Email, P2 → Slack, P1 → PagerDuty, P0 → SMS + Call
- **Document response**: Link each alert to runbook procedures

### 3. Log-Based Metrics

- **Use specific filters**: Avoid overly broad log queries
- **Add labels**: Extract useful dimensions (endpoint, error_type, etc.)
- **Test before deploying**: Verify log filter matches expected entries
- **Monitor metric cardinality**: High cardinality (many unique label combinations) increases costs

### 4. Cost Optimization

```bash
# Check monitoring costs
gcloud logging metrics list --project=applied-algebra-474804-e6 | wc -l

# Review log retention policies
gcloud logging buckets list --project=applied-algebra-474804-e6

# Estimate current usage
gcloud monitoring time-series list \
  --filter='metric.type="monitoring.googleapis.com/billing/bytes_ingested"' \
  --format="table(metric.type, points[0].value)" \
  --project=applied-algebra-474804-e6
```

**Cost Reduction Tips**:
- Set log retention to 30 days (default: 30 days)
- Use log exclusions for verbose DEBUG logs
- Sample high-volume metrics (e.g., every 5th request)
- Archive old traces to Cloud Storage

### 5. Regular Reviews

**Weekly**:
- Review dashboard for anomalies
- Check alert false positive rate
- Verify notification channels work

**Monthly**:
- Audit alert policies (enabled/disabled)
- Review metric cardinality
- Update thresholds based on growth

**Quarterly**:
- Add new business metrics as features launch
- Archive unused dashboards
- Optimize log filters and metric queries

---

## Troubleshooting

### Issue: Dashboards Not Showing Data

**Symptom**: Dashboard widgets display "No data available"

**Solutions**:

```bash
# 1. Verify service is emitting metrics
gcloud monitoring time-series list \
  --filter='resource.type="cloud_run_revision" AND resource.labels.service_name="upr-web-service"' \
  --limit=10 \
  --project=applied-algebra-474804-e6

# 2. Check if log-based metric is collecting data
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.message=~"Lead enriched"' \
  --limit=10 \
  --project=applied-algebra-474804-e6

# 3. Verify metric descriptor exists
gcloud logging metrics describe lead_enrichment_success \
  --project=applied-algebra-474804-e6

# 4. Test metric filter
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.message=~"Lead enriched successfully"' \
  --limit=5 \
  --format="table(timestamp, jsonPayload.message)" \
  --project=applied-algebra-474804-e6
```

### Issue: Alerts Not Firing

**Symptom**: Metric crosses threshold but no alert received

**Solutions**:

```bash
# 1. Check alert policy status
gcloud alpha monitoring policies list \
  --filter="displayName~'UPR'" \
  --format="table(displayName, enabled)" \
  --project=applied-algebra-474804-e6

# 2. Verify notification channel is valid
gcloud alpha monitoring channels list \
  --format="table(displayName, type, verificationStatus)" \
  --project=applied-algebra-474804-e6

# 3. Check alert policy conditions
gcloud alpha monitoring policies describe POLICY_NAME \
  --project=applied-algebra-474804-e6

# 4. View recent alert incidents
gcloud alpha monitoring policies list-incidents \
  --policy=POLICY_NAME \
  --project=applied-algebra-474804-e6
```

### Issue: High Monitoring Costs

**Symptom**: GCP bill shows high Cloud Monitoring charges

**Solutions**:

```bash
# 1. Identify high cardinality metrics
gcloud logging metrics list \
  --format="table(name, metricDescriptor.labels[].key)" \
  --project=applied-algebra-474804-e6

# 2. Check log ingestion volume
gcloud logging read \
  'resource.type="cloud_run_revision"' \
  --format="value(timestamp)" \
  --limit=10000 \
  --project=applied-algebra-474804-e6 | wc -l

# 3. Add log exclusion filters (example: exclude DEBUG logs)
gcloud logging sinks create exclude-debug-logs \
  --log-filter='severity < WARNING' \
  --destination=DESTINATION \
  --project=applied-algebra-474804-e6

# 4. Reduce metric collection frequency
# Edit dashboard JSON and change alignmentPeriod from 60s → 300s
```

### Issue: Traces Not Appearing in Cloud Trace

**Symptom**: OpenTelemetry traces not visible in Cloud Trace

**Solutions**:

```bash
# 1. Check OpenTelemetry initialization in logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.message=~"OpenTelemetry"' \
  --limit=20 \
  --format="table(timestamp, jsonPayload.message)" \
  --project=applied-algebra-474804-e6

# 2. Verify Cloud Trace API is enabled
gcloud services list --enabled | grep cloudtrace

# 3. Check service account permissions
gcloud projects get-iam-policy applied-algebra-474804-e6 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com"

# 4. Test trace export manually
# Add this to server.js to force trace export:
# const { trace } = require('@opentelemetry/api');
# const span = trace.getTracer('test').startSpan('test-span');
# span.end();
```

### Issue: Database Metrics Missing

**Symptom**: Cloud SQL metrics not showing in dashboard

**Solutions**:

```bash
# 1. Verify Cloud SQL instance is running
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6

# 2. Check if monitoring is enabled
gcloud sql instances describe upr-postgres \
  --format="value(settings.insightsConfig.queryInsightsEnabled)" \
  --project=applied-algebra-474804-e6

# 3. Enable Query Insights (if disabled)
gcloud sql instances patch upr-postgres \
  --insights-config-query-insights-enabled \
  --insights-config-query-string-length=1024 \
  --insights-config-record-application-tags \
  --project=applied-algebra-474804-e6

# 4. Test metric query
gcloud monitoring time-series list \
  --filter='resource.type="cloudsql_database" AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"' \
  --limit=10 \
  --project=applied-algebra-474804-e6
```

---

## Summary

This monitoring setup provides:

- **4 Comprehensive Dashboards**: Application Health, Business Metrics, Database Performance, Security
- **12 Alert Policies**: Covering P0-P3 incidents with appropriate thresholds
- **10 Log-Based Metrics**: Extracting business and operational metrics from logs
- **Custom Metrics**: Prometheus and OpenTelemetry integration
- **Notification Channels**: Email, Slack, PagerDuty, SMS support
- **Cost Optimization**: Best practices to minimize monitoring costs
- **Troubleshooting Guide**: Solutions to common monitoring issues

### Quick Links

- **GCP Monitoring Console**: https://console.cloud.google.com/monitoring?project=applied-algebra-474804-e6
- **Logs Explorer**: https://console.cloud.google.com/logs/query?project=applied-algebra-474804-e6
- **Cloud Trace**: https://console.cloud.google.com/traces/list?project=applied-algebra-474804-e6
- **Alert Policies**: https://console.cloud.google.com/monitoring/alerting/policies?project=applied-algebra-474804-e6

### Next Steps

1. Run the automated setup script (recommended)
2. Configure notification channels with your team's contact info
3. Import all 4 dashboards
4. Enable critical alerts (P0, P1)
5. Test notification channels
6. Review weekly and adjust thresholds based on actual usage

For operational procedures, see:
- `/Users/skc/DataScience/upr/docs/OPERATIONS_RUNBOOK.md` - Daily operations
- `/Users/skc/DataScience/upr/docs/DEPLOYMENT_RUNBOOK.md` - Deployment procedures
- `/Users/skc/DataScience/upr/docs/ADMIN_GUIDE.md` - Administrative tasks

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-19
**Maintained By**: DevOps Team
**Review Cycle**: Monthly
