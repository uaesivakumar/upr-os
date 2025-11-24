#!/bin/bash
# Setup shell aliases for UPR project
# This adds convenient shortcuts to your shell

SHELL_RC=""

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bashrc"
else
  echo "⚠️  Unknown shell. Please add aliases manually."
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ Setting Up UPR Shell Aliases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Shell config: $SHELL_RC"
echo ""

# Backup existing config
cp "$SHELL_RC" "$SHELL_RC.backup.$(date +%Y%m%d)"
echo "✅ Backed up to: $SHELL_RC.backup.$(date +%Y%m%d)"
echo ""

# Add aliases
cat >> "$SHELL_RC" << 'EOF'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# UPR Project Aliases (Auto-generated)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Navigation
alias upr="cd ~/DataScience/upr"

# Deployment & Operations
alias udeploy="cd ~/DataScience/upr && npm run deploy"
alias uhealth="cd ~/DataScience/upr && npm run health"
alias ubackup="cd ~/DataScience/upr && npm run backup"
alias ucosts="cd ~/DataScience/upr && npm run costs"

# Notion Integration
alias usync="cd ~/DataScience/upr && npm run notion -- sync"
alias upull="cd ~/DataScience/upr && npm run notion -- pull"
alias umetrics="cd ~/DataScience/upr && npm run notion -- metrics"

# Git Shortcuts
alias ustatus="cd ~/DataScience/upr && git status"
alias ulog="cd ~/DataScience/upr && git log --oneline -10"
alias ubranch="cd ~/DataScience/upr && git branch --show-current"

# Database
alias udb="PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql -h 34.121.0.240 -U upr_app -d upr_production"

# Quick Workflows
alias umorning="cd ~/DataScience/upr && npm run health && npm run costs && npm run notion -- pull"
alias ueod="cd ~/DataScience/upr && npm run notion -- sync && git push origin \$(git branch --show-current)"

# Resume AI Context
alias uresume="echo 'Resume UPR project context per RESUME_SESSION.md. Currently in Sprint 14. Ready to continue.'"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# End UPR Aliases
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

echo "✅ Aliases added to $SHELL_RC"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Available Aliases:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Navigation:"
echo "  upr          → cd to UPR project"
echo ""
echo "Operations:"
echo "  udeploy      → Deploy to cloud"
echo "  uhealth      → Check service health"
echo "  ubackup      → Backup database"
echo "  ucosts       → Check GCP costs"
echo ""
echo "Notion:"
echo "  usync        → Sync to Notion"
echo "  upull        → Pull from Notion"
echo "  umetrics     → Calculate metrics"
echo ""
echo "Git:"
echo "  ustatus      → Git status"
echo "  ulog         → Recent commits"
echo "  ubranch      → Current branch"
echo ""
echo "Database:"
echo "  udb          → Connect to PostgreSQL"
echo ""
echo "Workflows:"
echo "  umorning     → Morning routine (health + costs + pull)"
echo "  ueod         → End of day (sync + push)"
echo "  uresume      → Resume AI context command"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To activate aliases, run:"
echo "  source $SHELL_RC"
echo ""
echo "Or restart your terminal."
echo ""
