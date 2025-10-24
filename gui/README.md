# Metis GUI

A web-based graphical user interface for Metis - AI Security Code Review Tool.

## Features

- **Index Management**: Build and update vector database indexes for your codebase
- **Security Analysis**: Review patches, files, or entire codebases for security issues
- **Interactive Q&A**: Ask security-related questions about your code
- **Multiple Backends**: Support for ChromaDB and PostgreSQL vector stores
- **Export Results**: Download analysis results in JSON format
- **Real-time Status**: Monitor API connection and operation status
- **API Key Management**: Configure and store API keys securely through the GUI

## Prerequisites

1. Metis must be installed (`pip install -e .` in the parent directory)
2. Set up your LLM provider API key using one of these methods:

### Option 1: GUI Configuration (Recommended)
- Start the GUI and click "⚙️ Configure API" 
- Enter your API key through the secure web interface
- Keys are automatically saved to a `.env` file

### Option 2: Manual .env File
Create a `.env` file in the project root:
```bash
# Copy .env.example to .env and add your keys
cp .env.example .env
# Edit .env with your actual keys
```

### Option 3: Environment Variables
```bash
export OPENAI_API_KEY='your-api-key-here'
# OR
export AZURE_OPENAI_API_KEY='your-azure-key-here'
```

## Quick Start

From the project root directory, run:

```bash
./run_gui.sh
```

Then open your browser and navigate to: http://localhost:5000

## Manual Installation

If you prefer to install and run manually:

```bash
# Install Flask dependencies
pip install flask flask-cors

# Run the application
cd gui
python3 app.py
```

## Usage

1. **Configure Settings**: Set your codebase path, language plugin, and backend preferences
2. **Index Codebase**: Click the "Index" tab and start indexing (required before analysis)
3. **Perform Analysis**:
   - **Ask**: Query your codebase for security insights
   - **Review Patch**: Upload and analyze patch files
   - **Review File**: Analyze specific files in your codebase
   - **Review Code**: Comprehensive security review of entire codebase
   - **Update Index**: Apply patches to update your vector database

## Configuration Options

- **Codebase Path**: Directory containing your source code
- **Language Plugin**: Choose between C, Python, or Rust
- **Vector Backend**: ChromaDB (local) or PostgreSQL (requires setup)
- **Project Schema**: Unique identifier for your project index

## API Endpoints

The GUI exposes the following REST API endpoints:

- `POST /api/index` - Index codebase
- `POST /api/ask` - Ask questions
- `POST /api/review-patch` - Review patch file
- `POST /api/review-file` - Review specific file
- `POST /api/review-code` - Review entire codebase
- `POST /api/update` - Update index with patch
- `GET /api/status` - Check configuration status
- `GET /api/download/<filename>` - Download result files

## Security Notes

- API keys are stored in `.env` file with restricted file permissions (600)
- `.env` file is automatically excluded from git commits
- Change the Flask secret key in production environments
- Uploaded files are temporarily stored and cleaned up after processing
- Results are stored locally in the `results/` directory

## Troubleshooting

1. **API Key Not Configured**: Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY environment variable
2. **Port Already in Use**: Change the port in `app.py` or kill the process using port 5000
3. **Module Not Found**: Ensure Metis is installed with `pip install -e .` in the parent directory
4. **ChromaDB Issues**: Delete the `chromadb/` directory and re-index if corrupted