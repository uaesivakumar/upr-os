#!/bin/bash

################################################################################
# UPR Private Documentation Encryption Script (macOS)
#
# This script creates an encrypted disk image containing all private docs
# Uses macOS native encryption (no third-party tools needed)
################################################################################

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   UPR PRIVATE DOCUMENTATION ENCRYPTION SCRIPT              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if private directory exists
if [ ! -d "progress/private" ]; then
    echo -e "${RED}❌ ERROR: progress/private/ directory not found${NC}"
    echo "Please run this script from the UPR project root."
    exit 1
fi

# Count files in private directory
FILE_COUNT=$(find progress/private -type f | wc -l | tr -d ' ')
echo -e "${BLUE}📁 Found ${FILE_COUNT} files in progress/private/${NC}"
ls -lh progress/private/
echo ""

# Ask for confirmation
echo -e "${YELLOW}⚠️  This will create an encrypted disk image of your private documentation.${NC}"
echo ""
echo -e "${BLUE}What will happen:${NC}"
echo "1. Create encrypted sparse disk image (AES-256)"
echo "2. Copy all files from progress/private/ to encrypted image"
echo "3. Verify the copy was successful"
echo "4. Ask if you want to delete the originals (RECOMMENDED)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo -e "${BLUE}📝 Creating encrypted disk image...${NC}"
echo ""

# Create encrypted sparse image
# Sparse image only uses space for actual data (efficient)
hdiutil create -size 50m -fs HFS+ -encryption AES-256 \
  -volname "UPR-Private-Docs" \
  -type SPARSE \
  ~/Documents/upr-private-docs.sparseimage

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create encrypted disk image${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Encrypted disk image created at ~/Documents/upr-private-docs.sparseimage${NC}"
echo ""
echo -e "${BLUE}📋 Mounting encrypted image...${NC}"

# Mount the image
open ~/Documents/upr-private-docs.sparseimage

# Wait for mount
sleep 3

# Check if mounted
if [ ! -d "/Volumes/UPR-Private-Docs" ]; then
    echo -e "${RED}❌ Encrypted volume not mounted. Please enter your password when prompted.${NC}"
    echo "Then run this script again."
    exit 1
fi

echo -e "${GREEN}✅ Encrypted volume mounted${NC}"
echo ""
echo -e "${BLUE}📤 Copying files to encrypted volume...${NC}"

# Copy all files
cp -Rv progress/private/* /Volumes/UPR-Private-Docs/

echo ""
echo -e "${GREEN}✅ Files copied successfully${NC}"
echo ""

# Verify file count
COPIED_COUNT=$(find /Volumes/UPR-Private-Docs -type f | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -eq "$COPIED_COUNT" ]; then
    echo -e "${GREEN}✅ Verification: All ${FILE_COUNT} files copied successfully${NC}"
else
    echo -e "${RED}❌ WARNING: File count mismatch!${NC}"
    echo "Original: ${FILE_COUNT} files"
    echo "Copied: ${COPIED_COUNT} files"
    echo "Please verify manually before deleting originals."
    exit 1
fi

echo ""
echo "Files in encrypted volume:"
ls -lh /Volumes/UPR-Private-Docs/
echo ""

# Eject the volume
echo -e "${BLUE}💾 Ejecting encrypted volume...${NC}"
hdiutil detach /Volumes/UPR-Private-Docs

echo -e "${GREEN}✅ Encrypted volume ejected${NC}"
echo ""

# Ask if user wants to delete originals
echo -e "${YELLOW}⚠️  SECURITY RECOMMENDATION:${NC}"
echo "Delete the original unencrypted files in progress/private/"
echo ""
echo -e "${RED}THIS CANNOT BE UNDONE!${NC}"
echo "Make sure the encrypted backup works before deleting."
echo ""
read -p "Delete original unencrypted files? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}🗑️  Deleting original files...${NC}"

    # Create a backup first (just in case)
    mv progress/private progress/private.DELETE_ME

    echo -e "${GREEN}✅ Original files moved to: progress/private.DELETE_ME${NC}"
    echo ""
    echo "After verifying the encrypted backup works, delete this folder:"
    echo "  rm -rf progress/private.DELETE_ME"
else
    echo ""
    echo -e "${YELLOW}⚠️  Original files still exist in progress/private/${NC}"
    echo "Remember to delete them after verifying the encrypted backup!"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ENCRYPTION COMPLETE                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}📍 Encrypted backup location:${NC}"
echo "   ~/Documents/upr-private-docs.sparseimage"
echo ""
echo -e "${BLUE}🔓 To access encrypted files:${NC}"
echo "   1. Double-click: ~/Documents/upr-private-docs.sparseimage"
echo "   2. Enter your password"
echo "   3. Files will be in /Volumes/UPR-Private-Docs/"
echo "   4. When done: Right-click volume → Eject"
echo ""
echo -e "${BLUE}💾 Backup recommendations:${NC}"
echo "   1. Copy upr-private-docs.sparseimage to USB drive"
echo "   2. Upload to encrypted cloud (Tresorit/ProtonDrive)"
echo "   3. Store password in password manager (1Password/Bitwarden)"
echo ""
echo -e "${GREEN}✨ Your private documentation is now encrypted!${NC}"
echo ""

exit 0
