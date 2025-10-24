#!/bin/bash
# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

echo "🚀 Starting Metis GUI..."

# Check if API key is set
if [ -z "$OPENAI_API_KEY" ] && [ -z "$AZURE_OPENAI_API_KEY" ] && [ ! -f ".env" ]; then
    echo "⚠️  Warning: No API keys found."
    echo "   You can configure your API keys through the GUI by clicking '⚙️ Configure API'"
    echo "   or create a .env file with your keys (see .env.example)."
    echo ""
    echo "   Example .env file:"
    echo "   OPENAI_API_KEY=sk-your-key-here"
    echo ""
fi

# Install GUI dependencies
echo "📦 Installing GUI dependencies..."
python3 -m pip install --user -r gui/requirements.txt

# Load .env file if it exists
if [ -f ".env" ]; then
    echo "📄 Loading .env file..."
    set -a
    source .env
    set +a
fi

# Start the Flask server
echo "🌐 Starting web server on http://localhost:5000"
echo "   Press Ctrl+C to stop the server"
echo ""

cd gui && python3 app.py