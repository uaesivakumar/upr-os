#!/bin/bash
# UPR Notion Roadmap Setup Wizard

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "           🎯 UPR NOTION ROADMAP SETUP WIZARD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from scripts/notion/ directory"
    echo "   cd scripts/notion && ./setup.sh"
    exit 1
fi

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo ""
    echo "📝 Please create a .env file with your Notion credentials:"
    echo ""
    echo "1. Copy the example file:"
    echo "   cp .env.example .env"
    echo ""
    echo "2. Edit .env and add your values:"
    echo "   NOTION_TOKEN=secret_your_token_here"
    echo "   NOTION_PARENT_PAGE_ID=your_page_id_here"
    echo ""
    echo "3. Get your token from: https://www.notion.so/my-integrations"
    echo "4. Get your page ID from the Notion URL"
    echo "5. Share your page with the integration in Notion"
    echo ""
    echo "Then run this script again."
    exit 0
fi

# Load .env
export $(cat .env | xargs)

# Verify credentials
if [ -z "$NOTION_TOKEN" ] || [ "$NOTION_TOKEN" = "secret_your_notion_integration_token_here" ]; then
    echo "❌ Error: NOTION_TOKEN not set in .env file"
    echo "   Please edit .env and add your actual Notion integration token"
    exit 1
fi

if [ -z "$NOTION_PARENT_PAGE_ID" ] || [ "$NOTION_PARENT_PAGE_ID" = "2a166151dd1680e1b2f4ca09e2258dff" ]; then
    echo "⚠️  Warning: Using default NOTION_PARENT_PAGE_ID"
    echo "   Make sure this is correct, or update it in .env"
    echo ""
fi

echo "✅ Credentials loaded from .env"
echo ""

# Ask what to do
echo "What would you like to do?"
echo ""
echo "1) Create roadmap databases (first time setup)"
echo "2) Populate sprint data (after databases are created)"
echo "3) Do both (create + populate)"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Creating Notion databases..."
        npm run create-roadmap
        ;;
    2)
        echo ""
        echo "📝 Populating sprint data..."
        npm run populate-sprints
        ;;
    3)
        echo ""
        echo "🚀 Creating databases..."
        npm run create-roadmap
        echo ""
        echo "📝 Populating sprint data..."
        npm run populate-sprints
        ;;
    *)
        echo "❌ Invalid choice. Please run again and select 1, 2, or 3."
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "➡️  Open Notion to view your roadmap!"
echo ""
