# UPR Security Quick Reference

**Last Updated:** October 18, 2025

---

## 🔐 Encryption Commands

### Encrypt Private Docs
```bash
cd /Users/skc/DataScience/upr
./ENCRYPT_PRIVATE_DOCS.sh
```

### Access Encrypted Docs
```bash
# Double-click in Finder:
open ~/Documents/upr-private-docs.sparseimage
# Enter password → Files appear at /Volumes/UPR-Private-Docs/
```

### Eject Encrypted Volume
```bash
# Right-click volume in Finder → Eject
# OR:
hdiutil detach /Volumes/UPR-Private-Docs
```

---

## 📝 Weekly Update Workflow

**Every Friday:**

```bash
cd /Users/skc/DataScience/upr

# 1. Update progress
code progress/docs/CHECKPOINT.md
# Mark completed tasks as [x]

# 2. Run automation
./UPDATE_PROGRESS.sh
# Answer 'y' when prompted

# 3. Commit to git
git add progress/docs/
git commit -m "docs: weekly progress update"
git push
```

---

## 🔍 Security Verification

### Verify .gitignore is working:
```bash
git check-ignore -v progress/private/
# Should show: .gitignore:9:**/private/	progress/private/
```

### Check for accidentally committed secrets:
```bash
git status --short
# Should NOT show progress/private/ files
```

---

## 📁 File Locations

### Public Docs (safe to commit):
```
/Users/skc/DataScience/upr/progress/docs/
├── VISION.md
├── ROADMAP.md
├── CHECKPOINT.md
├── DECISIONS_PUBLIC.md
├── MOAT_METRICS.md
└── PROGRESS_TRACKER.md
```

### Private Docs (encrypted):
```
~/Documents/upr-private-docs.sparseimage
Contains:
├── ARCHITECTURE_FULL.md
├── DECISIONS_FULL.md
├── PHASE_0_FOUNDATION_FULL.md
└── API_OPTIMIZATION_SECRETS.md
```

### Automation Scripts:
```
/Users/skc/DataScience/upr/
├── UPDATE_PROGRESS.sh
└── ENCRYPT_PRIVATE_DOCS.sh
```

---

## 🚨 Emergency Procedures

### If Private Docs Accidentally Committed:

```bash
# 1. IMMEDIATELY rotate all API keys
# - Apollo.io
# - OpenAI
# - SerpAPI
# - NeverBounce

# 2. Remove from git history
git filter-repo --path progress/private/ --invert-paths
git push --force --all

# 3. Change deployment credentials
```

### If Encryption Password Forgotten:

```
⚠️  NO RECOVERY POSSIBLE
AES-256 encryption cannot be broken.
This is why backup to password manager is critical!
```

---

## 🎯 Common Tasks

### Share Progress with Investors:
```bash
# Email these files (public only):
- progress/docs/VISION.md
- progress/docs/ROADMAP.md
- progress/docs/CHECKPOINT.md
- progress/docs/MOAT_METRICS.md

# NEVER share:
- Anything in progress/private/
```

### Update Implementation Details:
```bash
# 1. Decrypt
open ~/Documents/upr-private-docs.sparseimage

# 2. Edit files in /Volumes/UPR-Private-Docs/

# 3. Eject when done
# Right-click → Eject

# Changes are automatically saved to encrypted image
```

### Backup Encrypted Docs:
```bash
# USB Drive
cp ~/Documents/upr-private-docs.sparseimage /Volumes/YOUR_USB/

# Encrypted Cloud (Tresorit/ProtonDrive)
# Upload via web interface
```

---

## 📞 Support

**Questions about:**
- Security: Review this document
- Vision: Read progress/docs/VISION.md
- Timeline: Read progress/docs/ROADMAP.md
- Progress: Read progress/docs/CHECKPOINT.md

---

**Remember:** Public docs = strategy, Private docs = implementation
