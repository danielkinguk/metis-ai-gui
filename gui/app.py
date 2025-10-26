# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

import os
import json
import logging
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, session
from flask_cors import CORS
from werkzeug.utils import secure_filename
import uuid
from dotenv import load_dotenv, set_key, unset_key
import re

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'metis-gui-secret-key-change-in-production')
CORS(app)

# .env file location (in project root)
ENV_FILE = Path(__file__).parent.parent / '.env'

# Load existing .env file
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_FOLDER = Path('uploads')
RESULTS_FOLDER = Path('results')
UPLOAD_FOLDER.mkdir(exist_ok=True)
RESULTS_FOLDER.mkdir(exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

ALLOWED_EXTENSIONS = {'patch', 'diff', 'txt', 'py', 'c', 'cpp', 'js', 'rs', 'go', 'java'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_config():
    """Load API configuration from .env file."""
    # Reload the .env file to get latest values
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE, override=True)
    
    config = {}
    config['openai_api_key'] = os.environ.get('OPENAI_API_KEY', '')
    config['azure_api_key'] = os.environ.get('AZURE_OPENAI_API_KEY', '')
    config['azure_endpoint'] = os.environ.get('AZURE_OPENAI_ENDPOINT', '')
    config['azure_deployment'] = os.environ.get('AZURE_OPENAI_DEPLOYMENT_NAME', '')
    
    # Check if .env file exists and get its modification time
    if ENV_FILE.exists():
        config['updated_at'] = datetime.fromtimestamp(ENV_FILE.stat().st_mtime).isoformat()
    
    return config

def save_config(config):
    """Save API configuration to .env file."""
    # Ensure .env file exists
    ENV_FILE.touch()
    ENV_FILE.chmod(0o600)  # Restrict access to owner only
    
    # Update environment variables and .env file
    if config.get('openai_api_key'):
        set_key(ENV_FILE, 'OPENAI_API_KEY', config['openai_api_key'])
        os.environ['OPENAI_API_KEY'] = config['openai_api_key']
    
    if config.get('azure_api_key'):
        set_key(ENV_FILE, 'AZURE_OPENAI_API_KEY', config['azure_api_key'])
        os.environ['AZURE_OPENAI_API_KEY'] = config['azure_api_key']
    
    if config.get('azure_endpoint'):
        set_key(ENV_FILE, 'AZURE_OPENAI_ENDPOINT', config['azure_endpoint'])
        os.environ['AZURE_OPENAI_ENDPOINT'] = config['azure_endpoint']
    
    if config.get('azure_deployment'):
        set_key(ENV_FILE, 'AZURE_OPENAI_DEPLOYMENT_NAME', config['azure_deployment'])
        os.environ['AZURE_OPENAI_DEPLOYMENT_NAME'] = config['azure_deployment']

def clear_config():
    """Clear all API configuration from .env file."""
    if ENV_FILE.exists():
        # Remove keys from .env file
        for key in ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT_NAME']:
            unset_key(ENV_FILE, key)
    
    # Clear from environment
    os.environ.pop('OPENAI_API_KEY', None)
    os.environ.pop('AZURE_OPENAI_API_KEY', None)
    os.environ.pop('AZURE_OPENAI_ENDPOINT', None)
    os.environ.pop('AZURE_OPENAI_DEPLOYMENT_NAME', None)

def apply_api_keys():
    """Apply stored API keys to environment variables."""
    # This is now handled automatically by load_dotenv and save_config
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE, override=True)

def run_metis_command(command, args=None):
    """Execute Metis command and return results."""
    # Apply API keys before running command
    apply_api_keys()
    
    cmd = ['python3', '-m', 'metis', '--non-interactive', '--quiet']
    
    if args:
        for key, value in args.items():
            if value is not None and value != '':
                cmd.extend([f'--{key}', str(value)])
    
    output_file = RESULTS_FOLDER / f"result_{uuid.uuid4()}.json"
    cmd.extend(['--output-file', str(output_file)])
    cmd.extend(['--command', command])
    
    try:
        logger.info(f"Running command: {' '.join(cmd)}")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=Path(__file__).parent.parent
        )
        
        # Filter out common warnings from stderr
        stderr_lines = result.stderr.split('\n') if result.stderr else []
        filtered_stderr = []
        skip_next_lines = 0

        for line in stderr_lines:
            # If we're in the middle of skipping warning lines
            if skip_next_lines > 0:
                skip_next_lines -= 1
                continue

            # Skip Pydantic warnings and related lines
            if 'UnsupportedFieldAttributeWarning' in line:
                skip_next_lines = 2  # Skip the next 2 lines of the warning
                continue
            if 'validate_default' in line:
                continue
            if 'warnings.warn' in line:
                continue
            if '_generate_schema.py' in line and 'UnsupportedFieldAttributeWarning' in line:
                continue
            if line.strip().startswith('warnings.warn('):
                continue

            # Only keep non-empty lines
            if line.strip():
                filtered_stderr.append(line)

        filtered_stderr_text = '\n'.join(filtered_stderr) if filtered_stderr else ''

        response = {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': filtered_stderr_text,
            'output_file': None,
            'results': None
        }

        if output_file.exists():
            try:
                with open(output_file, 'r') as f:
                    response['results'] = json.load(f)
                response['output_file'] = str(output_file)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse JSON from {output_file}")
        else:
            # If no output file but command succeeded, provide helpful message
            if result.returncode == 0:
                if not result.stdout and not filtered_stderr_text:
                    response['stdout'] = 'Operation completed successfully.'
                logger.warning(f"Output file not created: {output_file}")

        # Check for common error messages in stdout/stderr and provide helpful feedback
        combined_output = (response['stdout'] or '') + (response['stderr'] or '')
        if 'OPENAI_API_KEY environment variable is required' in combined_output or \
           'AZURE_OPENAI_API_KEY' in combined_output:
            response['success'] = False
            response['error'] = 'API key not configured. Please click "⚙️ Configure API" in the header to set up your OpenAI or Azure OpenAI API key before using Metis.'
            response['stdout'] = ''
            response['stderr'] = ''
        elif not response['success'] and response['stdout']:
            # If command failed with stdout, treat stdout as error message
            response['error'] = response['stdout']
            response['stdout'] = ''

        # Log the response for debugging
        logger.info(f"Response: success={response['success']}, has_results={response['results'] is not None}, has_error={response.get('error') is not None}")

        return response
    except subprocess.TimeoutExpired:
        return {'success': False, 'error': 'Command timed out after 5 minutes'}
    except Exception as e:
        logger.error(f"Error running Metis command: {e}")
        return {'success': False, 'error': str(e)}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/index', methods=['POST'])
def index_codebase():
    """Index the codebase for analysis."""
    data = request.json
    args = {
        'codebase-path': data.get('codebase_path', '.'),
        'language-plugin': data.get('language', 'c'),
        'backend': data.get('backend', 'chroma'),
        'project-schema': data.get('project_schema', 'myproject-main')
    }
    
    if args['backend'] == 'chroma':
        args['chroma-dir'] = data.get('chroma_dir', './chromadb')
    
    result = run_metis_command('index', args)
    return jsonify(result)

@app.route('/api/ask', methods=['POST'])
def ask_question():
    """Ask a question about the codebase."""
    data = request.json
    question = data.get('question', '')
    
    if not question:
        return jsonify({'success': False, 'error': 'Question is required'}), 400
    
    args = {
        'codebase-path': data.get('codebase_path', '.'),
        'language-plugin': data.get('language', 'c'),
        'backend': data.get('backend', 'chroma'),
        'project-schema': data.get('project_schema', 'myproject-main')
    }
    
    if args['backend'] == 'chroma':
        args['chroma-dir'] = data.get('chroma_dir', './chromadb')
    
    result = run_metis_command(f'ask {question}', args)
    return jsonify(result)

@app.route('/api/review-patch', methods=['POST'])
def review_patch():
    """Review a patch file for security issues."""
    if 'patch_file' not in request.files:
        return jsonify({'success': False, 'error': 'No patch file provided'}), 400
    
    file = request.files['patch_file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = UPLOAD_FOLDER / f"{uuid.uuid4()}_{filename}"
        file.save(str(filepath))
        
        args = {
            'codebase-path': request.form.get('codebase_path', '.'),
            'language-plugin': request.form.get('language', 'c'),
            'backend': request.form.get('backend', 'chroma'),
            'project-schema': request.form.get('project_schema', 'myproject-main')
        }
        
        if args['backend'] == 'chroma':
            args['chroma-dir'] = request.form.get('chroma_dir', './chromadb')
        
        result = run_metis_command(f'review_patch {filepath}', args)
        
        # Clean up uploaded file
        try:
            filepath.unlink()
        except:
            pass
        
        return jsonify(result)
    
    return jsonify({'success': False, 'error': 'Invalid file type'}), 400

@app.route('/api/review-file', methods=['POST'])
def review_file():
    """Review a specific file for security issues."""
    data = request.json
    file_path = data.get('file_path', '')
    
    if not file_path:
        return jsonify({'success': False, 'error': 'File path is required'}), 400
    
    args = {
        'codebase-path': data.get('codebase_path', '.'),
        'language-plugin': data.get('language', 'c'),
        'backend': data.get('backend', 'chroma'),
        'project-schema': data.get('project_schema', 'myproject-main')
    }
    
    if args['backend'] == 'chroma':
        args['chroma-dir'] = data.get('chroma_dir', './chromadb')
    
    result = run_metis_command(f'review_file {file_path}', args)
    return jsonify(result)

@app.route('/api/review-code', methods=['POST'])
def review_code():
    """Review entire codebase for security issues."""
    data = request.json
    args = {
        'codebase-path': data.get('codebase_path', '.'),
        'language-plugin': data.get('language', 'c'),
        'backend': data.get('backend', 'chroma'),
        'project-schema': data.get('project_schema', 'myproject-main')
    }
    
    if args['backend'] == 'chroma':
        args['chroma-dir'] = data.get('chroma_dir', './chromadb')
    
    result = run_metis_command('review_code', args)
    return jsonify(result)

@app.route('/api/update', methods=['POST'])
def update_index():
    """Update the index with a patch."""
    if 'patch_file' not in request.files:
        return jsonify({'success': False, 'error': 'No patch file provided'}), 400
    
    file = request.files['patch_file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = UPLOAD_FOLDER / f"{uuid.uuid4()}_{filename}"
        file.save(str(filepath))
        
        args = {
            'codebase-path': request.form.get('codebase_path', '.'),
            'language-plugin': request.form.get('language', 'c'),
            'backend': request.form.get('backend', 'chroma'),
            'project-schema': request.form.get('project_schema', 'myproject-main')
        }
        
        if args['backend'] == 'chroma':
            args['chroma-dir'] = request.form.get('chroma_dir', './chromadb')
        
        result = run_metis_command(f'update {filepath}', args)
        
        # Clean up uploaded file
        try:
            filepath.unlink()
        except:
            pass
        
        return jsonify(result)
    
    return jsonify({'success': False, 'error': 'Invalid file type'}), 400

@app.route('/api/download/<path:filename>')
def download_result(filename):
    """Download a result file."""
    file_path = RESULTS_FOLDER / filename
    if file_path.exists() and file_path.is_file():
        return send_file(str(file_path), as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

@app.route('/api/status', methods=['GET'])
def status():
    """Check if Metis is configured and ready."""
    # Apply stored keys first
    apply_api_keys()
    
    has_openai_key = bool(os.environ.get('OPENAI_API_KEY'))
    has_azure_key = bool(os.environ.get('AZURE_OPENAI_API_KEY'))
    
    # Check if we have stored keys
    config = load_config()
    has_stored_openai = bool(config.get('openai_api_key'))
    has_stored_azure = bool(config.get('azure_api_key'))
    
    return jsonify({
        'configured': has_openai_key or has_azure_key or has_stored_openai or has_stored_azure,
        'provider': 'azure_openai' if (has_azure_key or has_stored_azure) else 'openai' if (has_openai_key or has_stored_openai) else None,
        'backend_options': ['chroma', 'postgres'],
        'has_stored_config': has_stored_openai or has_stored_azure
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration (without exposing keys)."""
    config = load_config()
    
    # Mask the API keys for security
    masked_config = {}
    if config.get('openai_api_key'):
        key = config['openai_api_key']
        masked_config['openai_api_key'] = f"{key[:7]}...{key[-4:]}" if len(key) > 11 else "***"
    
    if config.get('azure_api_key'):
        key = config['azure_api_key']
        masked_config['azure_api_key'] = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
    
    masked_config['azure_endpoint'] = config.get('azure_endpoint', '')
    masked_config['azure_deployment'] = config.get('azure_deployment', '')
    masked_config['updated_at'] = config.get('updated_at', '')
    
    return jsonify(masked_config)

@app.route('/api/config', methods=['POST'])
def update_config():
    """Update API configuration."""
    data = request.json
    
    config = {}
    if data.get('openai_api_key'):
        config['openai_api_key'] = data['openai_api_key']
    
    if data.get('azure_api_key'):
        config['azure_api_key'] = data['azure_api_key']
    
    if data.get('azure_endpoint'):
        config['azure_endpoint'] = data['azure_endpoint']
    
    if data.get('azure_deployment'):
        config['azure_deployment'] = data['azure_deployment']
    
    try:
        save_config(config)
        apply_api_keys()
        return jsonify({'success': True, 'message': 'Configuration saved successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/config', methods=['DELETE'])
def delete_config():
    """Clear all stored API configuration."""
    try:
        clear_config()
        return jsonify({'success': True, 'message': 'Configuration cleared successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/browse', methods=['GET'])
def browse_directories():
    """Browse directories for folder selection."""
    current_path = request.args.get('path', str(Path.home()))
    
    try:
        # Ensure the path exists and is a directory
        path_obj = Path(current_path).resolve()
        if not path_obj.exists() or not path_obj.is_dir():
            path_obj = Path.home()
        
        # Get parent directory info
        parent = str(path_obj.parent) if path_obj.parent != path_obj else None
        
        # List directories and files
        items = []
        try:
            for item in sorted(path_obj.iterdir()):
                if item.name.startswith('.') and item.name not in ['.git', '.vscode', '.idea']:
                    continue  # Skip hidden files except common dev folders
                
                try:
                    is_dir = item.is_dir()
                    # For directories, check if they might contain code
                    has_code = False
                    if is_dir:
                        # Quick check for common code file extensions
                        code_extensions = {'.py', '.js', '.ts', '.cpp', '.c', '.h', '.java', '.rs', '.go', '.php', '.rb', '.cs', '.kt', '.swift'}
                        try:
                            has_code = any(
                                f.suffix.lower() in code_extensions 
                                for f in list(item.iterdir())[:50]  # Check first 50 files only
                                if f.is_file()
                            )
                        except (PermissionError, OSError):
                            pass
                    
                    items.append({
                        'name': item.name,
                        'path': str(item),
                        'is_directory': is_dir,
                        'has_code': has_code,
                        'size': item.stat().st_size if item.is_file() else None,
                        'modified': item.stat().st_mtime
                    })
                except (PermissionError, OSError):
                    # Skip items we can't access
                    continue
        except PermissionError:
            return jsonify({'error': 'Permission denied accessing this directory'}), 403
        
        return jsonify({
            'current_path': str(path_obj),
            'parent_path': parent,
            'items': items[:100]  # Limit to 100 items for performance
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/preview-file', methods=['GET'])
def preview_file():
    """Preview file content for the folder browser."""
    file_path = request.args.get('path', '')
    
    if not file_path:
        return jsonify({'success': False, 'error': 'File path is required'}), 400
    
    try:
        path_obj = Path(file_path).resolve()
        
        # Security check - ensure file is within reasonable bounds
        if not path_obj.exists() or not path_obj.is_file():
            return jsonify({'success': False, 'error': 'File not found'}), 404
        
        # Check file size (limit to 1MB for preview)
        file_size = path_obj.stat().st_size
        if file_size > 1024 * 1024:  # 1MB limit
            return jsonify({'success': False, 'error': 'File too large for preview'}), 413
        
        # Determine file type
        file_ext = path_obj.suffix.lower()
        text_extensions = {'.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.xml', 
                          '.c', '.cpp', '.h', '.hpp', '.java', '.rs', '.go', '.php', '.rb', '.cs', '.kt', '.swift'}
        
        if file_ext in text_extensions:
            # Read as text
            try:
                with open(path_obj, 'r', encoding='utf-8') as f:
                    content = f.read()
                return jsonify({
                    'success': True,
                    'content': content,
                    'type': 'text',
                    'size': file_size
                })
            except UnicodeDecodeError:
                return jsonify({'success': False, 'error': 'File contains binary data'}), 400
        else:
            # For binary files, return basic info
            return jsonify({
                'success': True,
                'content': '',
                'type': 'binary',
                'size': file_size
            })
    
    except PermissionError:
        return jsonify({'success': False, 'error': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/test-connection', methods=['POST'])
def test_connection():
    """Test API connection with provided or stored keys."""
    data = request.json
    
    # Temporarily set environment variables if provided
    original_env = {}
    if data.get('openai_api_key'):
        original_env['OPENAI_API_KEY'] = os.environ.get('OPENAI_API_KEY')
        os.environ['OPENAI_API_KEY'] = data['openai_api_key']
    elif data.get('azure_api_key'):
        original_env['AZURE_OPENAI_API_KEY'] = os.environ.get('AZURE_OPENAI_API_KEY')
        os.environ['AZURE_OPENAI_API_KEY'] = data['azure_api_key']
        if data.get('azure_endpoint'):
            original_env['AZURE_OPENAI_ENDPOINT'] = os.environ.get('AZURE_OPENAI_ENDPOINT')
            os.environ['AZURE_OPENAI_ENDPOINT'] = data['azure_endpoint']
        if data.get('azure_deployment'):
            original_env['AZURE_OPENAI_DEPLOYMENT_NAME'] = os.environ.get('AZURE_OPENAI_DEPLOYMENT_NAME')
            os.environ['AZURE_OPENAI_DEPLOYMENT_NAME'] = data['azure_deployment']
    else:
        # Use stored keys
        apply_api_keys()
    
    try:
        # Try a simple Metis command to test the connection
        cmd = ['python3', '-m', 'metis', '--version']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        success = result.returncode == 0 and (
            os.environ.get('OPENAI_API_KEY') or 
            os.environ.get('AZURE_OPENAI_API_KEY')
        )
        
        # Restore original environment variables
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        
        if success:
            provider = 'Azure OpenAI' if os.environ.get('AZURE_OPENAI_API_KEY') else 'OpenAI'
            return jsonify({'success': True, 'message': f'Successfully connected to {provider}'})
        else:
            return jsonify({'success': False, 'error': 'Connection failed. Please check your API keys.'})
    
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Connection test timed out'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    # Ensure .env is loaded at startup
    apply_api_keys()
    app.run(debug=True, host='0.0.0.0', port=5000)