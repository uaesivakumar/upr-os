# Notion Integration - Quick Reference Card

**Last Updated:** 2025-11-05
**Phase:** 2 (Advanced Features)
**Status:** ✅ Production Ready

---

## 🚀 Most Common Commands

```bash
# Sync local changes to Notion
npm run notion -- sync

# Get latest from Notion
npm run notion -- pull

# Close current sprint (auto-captures git info)
npm run notion -- close 14

# Calculate and push metrics
npm run notion -- metrics

# Show all commands
npm run notion -- help
```

---

## 📊 What's In Notion

**Your Roadmap:**
https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e

**3 Databases:**
1. **UPR Modules & Streams** - Feature areas (6 modules)
2. **UPR Sprint Work Items** - Tasks (4+ items)
3. **UPR Sprint Journal** - Sprint history (8 sprints)

---

## 🔄 Workflows

### Daily Development
```bash
# 1. Code features
git add . && git commit -m "Add feature"

# 2. Update sprint log
# Edit UPR_SPRINT_LOG.md

# 3. Sync to Notion
npm run notion -- sync
```

### Sprint Close
```bash
npm run notion -- close 14
npm run notion -- metrics
git push origin main  # Triggers CI/CD sync
```

### Pull Team Updates
```bash
npm run notion -- pull
# Review UPR_SPRINT_LOG.md
```

---

## 🎯 Phase 2 Features

✅ **Bi-directional sync** - Edit in Notion or VS Code
✅ **Auto-metrics** - Velocity, bugs fixed, features added
✅ **Commit tracking** - Automatic commit ranges
✅ **CI/CD integration** - Auto-sync on deployment
✅ **Unified CLI** - Single command interface
✅ **Audit trail** - Timestamps on all updates

---

## 📁 Key Files

- `UPR_SPRINT_LOG.md` - Your sprint tracking file
- `scripts/notion/PHASE2_FEATURES.md` - Complete Phase 2 guide
- `scripts/notion/README.md` - Full documentation
- `.github/workflows/notion-sync.yml` - CI/CD workflow

---

## 🆘 Troubleshooting

**Sync failed?**
- Check NOTION_TOKEN in `scripts/notion/.env`
- Verify database IDs are correct

**Pull not working?**
- Make sure you have entries in Notion first
- Run `npm run notion -- sync` to create initial entries

**Metrics not calculating?**
- Ensure work items are linked to modules
- Check that sprints have commit data

---

## 💡 Pro Tips

1. **Use pull before making local changes** if team edits Notion
2. **Run metrics weekly** for best insights
3. **Set up Git hooks** for automatic sync:
   ```bash
   npx husky add .husky/pre-push "npm run notion -- sync"
   ```
4. **Add GitHub secrets** for CI/CD auto-sync

---

## 🔐 Security

- Token stored in `scripts/notion/.env` (never committed)
- All secrets in `.gitignore`
- GitHub secrets encrypted
- Notion integration scoped to workspace

---

## 📈 Cost Savings Summary

**GCP Optimization:**
- Before: $420/month
- After: $113/month
- **Savings: $307/month (73%)**
- Annual: ~$3,684 saved

---

**Need more help?** Check `scripts/notion/PHASE2_FEATURES.md`
