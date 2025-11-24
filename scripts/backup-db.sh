#!/bin/bash
# Automated database backup script
# Usage: ./scripts/backup-db.sh

set -e

DB_HOST="34.121.0.240"
DB_USER="upr_app"
DB_NAME="upr_production"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/upr_db_backup_$TIMESTAMP.sql"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 Database Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
echo "📦 Backing up $DB_NAME..."
PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -F c \
  -f "$BACKUP_FILE"

# Compress backup
echo "🗜️  Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

# Get file size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo "✅ Backup complete!"
echo "   File: $BACKUP_FILE"
echo "   Size: $SIZE"
echo ""

# Keep only last 7 backups
echo "🧹 Cleaning old backups (keeping last 7)..."
cd "$BACKUP_DIR"
ls -t upr_db_backup_*.sql.gz | tail -n +8 | xargs -r rm
echo "   $(ls -1 upr_db_backup_*.sql.gz 2>/dev/null | wc -l) backups retained"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
