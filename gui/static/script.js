let currentResultFile = null;

// Check API status on load
window.addEventListener('DOMContentLoaded', () => {
    checkStatus();
    setupFileInputs();
    setupBackendToggle();
    loadStoredConfig();
});

function checkStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            const statusDot = document.querySelector('.status-dot');
            const statusText = document.querySelector('.status-text');
            
            if (data.configured) {
                statusDot.classList.add('connected');
                statusText.textContent = `Connected (${data.provider})`;
            } else {
                statusDot.classList.add('error');
                statusText.textContent = 'API key not configured';
                showError('Please set OPENAI_API_KEY or AZURE_OPENAI_API_KEY environment variable');
            }
        })
        .catch(error => {
            console.error('Status check failed:', error);
            document.querySelector('.status-dot').classList.add('error');
            document.querySelector('.status-text').textContent = 'Connection error';
        });
}

function setupFileInputs() {
    // Setup patch file input
    const patchInput = document.getElementById('patch-file');
    const patchFilename = document.getElementById('patch-filename');
    
    patchInput.addEventListener('change', (e) => {
        const filename = e.target.files[0]?.name || '';
        patchFilename.textContent = filename;
    });
    
    // Setup update patch file input
    const updateInput = document.getElementById('update-patch-file');
    const updateFilename = document.getElementById('update-patch-filename');
    
    updateInput.addEventListener('change', (e) => {
        const filename = e.target.files[0]?.name || '';
        updateFilename.textContent = filename;
    });
}

function setupBackendToggle() {
    const backendSelect = document.getElementById('backend');
    const chromaConfig = document.getElementById('chroma-config');
    
    backendSelect.addEventListener('change', () => {
        if (backendSelect.value === 'chroma') {
            chromaConfig.style.display = 'block';
        } else {
            chromaConfig.style.display = 'none';
        }
    });
}

function openTab(evt, tabName) {
    const tabContents = document.getElementsByClassName('tab-content');
    for (let content of tabContents) {
        content.classList.remove('active');
    }
    
    const tabButtons = document.getElementsByClassName('tab-button');
    for (let button of tabButtons) {
        button.classList.remove('active');
    }
    
    document.getElementById(tabName).classList.add('active');
    evt.currentTarget.classList.add('active');
}

function getConfig() {
    return {
        codebase_path: document.getElementById('codebase-path').value,
        language: document.getElementById('language').value,
        backend: document.getElementById('backend').value,
        project_schema: document.getElementById('project-schema').value,
        chroma_dir: document.getElementById('chroma-dir').value
    };
}

function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showResults(data) {
    const resultsPanel = document.getElementById('results');
    const resultContent = document.getElementById('result-content');
    const downloadBtn = document.getElementById('download-btn');
    
    resultsPanel.style.display = 'block';
    
    if (data.success) {
        if (data.results) {
            resultContent.innerHTML = formatResults(data.results);
            currentResultFile = data.output_file;
            downloadBtn.style.display = 'inline-block';
        } else if (data.stdout) {
            resultContent.textContent = data.stdout;
        } else {
            resultContent.textContent = 'Operation completed successfully.';
        }
    } else {
        resultContent.innerHTML = `<div class="issue">
            <strong>Error:</strong> ${data.error || data.stderr || 'Unknown error occurred'}
        </div>`;
    }
    
    resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

function formatResults(results) {
    if (Array.isArray(results)) {
        return results.map(issue => formatIssue(issue)).join('');
    } else if (typeof results === 'object') {
        return `<pre>${JSON.stringify(results, null, 2)}</pre>`;
    }
    return results.toString();
}

function formatIssue(issue) {
    const severity = issue.severity || 'medium';
    const severityClass = `severity-${severity.toLowerCase()}`;
    
    return `
        <div class="issue">
            <div class="issue-header">
                <strong>${issue.title || issue.message || 'Security Issue'}</strong>
                <span class="issue-severity ${severityClass}">${severity.toUpperCase()}</span>
            </div>
            <p><strong>File:</strong> ${issue.file || 'N/A'}</p>
            <p><strong>Line:</strong> ${issue.line || 'N/A'}</p>
            <p>${issue.description || issue.message || ''}</p>
            ${issue.recommendation ? `<p><strong>Recommendation:</strong> ${issue.recommendation}</p>` : ''}
        </div>
    `;
}

function clearResults() {
    document.getElementById('results').style.display = 'none';
    document.getElementById('result-content').innerHTML = '';
    currentResultFile = null;
    document.getElementById('download-btn').style.display = 'none';
}

function downloadResults() {
    if (currentResultFile) {
        window.open(`/api/download/${currentResultFile.split('/').pop()}`, '_blank');
    }
}

function showError(message) {
    showResults({ success: false, error: message });
}

// API Functions
async function indexCodebase() {
    showLoading();
    document.getElementById('index-progress').style.display = 'block';
    
    try {
        const response = await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getConfig())
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to index codebase: ${error.message}`);
    } finally {
        hideLoading();
        document.getElementById('index-progress').style.display = 'none';
    }
}

async function askQuestion() {
    const question = document.getElementById('question').value.trim();
    
    if (!question) {
        showError('Please enter a question');
        return;
    }
    
    showLoading();
    
    try {
        const config = getConfig();
        config.question = question;
        
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to process question: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function reviewPatch() {
    const fileInput = document.getElementById('patch-file');
    
    if (!fileInput.files[0]) {
        showError('Please select a patch file');
        return;
    }
    
    showLoading();
    
    try {
        const formData = new FormData();
        formData.append('patch_file', fileInput.files[0]);
        
        const config = getConfig();
        for (const [key, value] of Object.entries(config)) {
            formData.append(key, value);
        }
        
        const response = await fetch('/api/review-patch', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to review patch: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function reviewFile() {
    const filePath = document.getElementById('file-path').value.trim();
    
    if (!filePath) {
        showError('Please enter a file path');
        return;
    }
    
    showLoading();
    
    try {
        const config = getConfig();
        config.file_path = filePath;
        
        const response = await fetch('/api/review-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to review file: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function reviewCode() {
    if (!confirm('This will review your entire codebase and may take a long time. Continue?')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/review-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getConfig())
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to review code: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function updateIndex() {
    const fileInput = document.getElementById('update-patch-file');
    
    if (!fileInput.files[0]) {
        showError('Please select a patch file');
        return;
    }
    
    showLoading();
    
    try {
        const formData = new FormData();
        formData.append('patch_file', fileInput.files[0]);
        
        const config = getConfig();
        for (const [key, value] of Object.entries(config)) {
            formData.append(key, value);
        }
        
        const response = await fetch('/api/update', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        showError(`Failed to update index: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// API Configuration Modal Functions
function openConfigModal() {
    document.getElementById('config-modal').style.display = 'flex';
    loadStoredConfig();
}

function closeConfigModal() {
    document.getElementById('config-modal').style.display = 'none';
    clearConfigMessage();
}

function toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function showConfigMessage(message, isError = false) {
    const messageEl = document.getElementById('config-message');
    messageEl.textContent = message;
    messageEl.className = `config-message ${isError ? 'error' : 'success'}`;
    messageEl.style.display = 'block';
}

function clearConfigMessage() {
    document.getElementById('config-message').style.display = 'none';
}

async function loadStoredConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        if (config.openai_api_key) {
            document.getElementById('openai-key').placeholder = `Configured: ${config.openai_api_key}`;
        }
        
        if (config.azure_api_key) {
            document.getElementById('azure-key').placeholder = `Configured: ${config.azure_api_key}`;
        }
        
        if (config.azure_endpoint) {
            document.getElementById('azure-endpoint').value = config.azure_endpoint;
        }
        
        if (config.azure_deployment) {
            document.getElementById('azure-deployment').value = config.azure_deployment;
        }
    } catch (error) {
        console.error('Failed to load configuration:', error);
    }
}

async function saveApiConfig() {
    clearConfigMessage();
    
    const config = {};
    const openaiKey = document.getElementById('openai-key').value.trim();
    const azureKey = document.getElementById('azure-key').value.trim();
    const azureEndpoint = document.getElementById('azure-endpoint').value.trim();
    const azureDeployment = document.getElementById('azure-deployment').value.trim();
    
    if (openaiKey) {
        config.openai_api_key = openaiKey;
    }
    
    if (azureKey) {
        config.azure_api_key = azureKey;
        if (azureEndpoint) config.azure_endpoint = azureEndpoint;
        if (azureDeployment) config.azure_deployment = azureDeployment;
    }
    
    if (Object.keys(config).length === 0) {
        showConfigMessage('Please enter at least one API key', true);
        return;
    }
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showConfigMessage(result.message);
            // Clear input fields after successful save
            document.getElementById('openai-key').value = '';
            document.getElementById('azure-key').value = '';
            // Reload configuration to update placeholders
            loadStoredConfig();
            // Update main status
            checkStatus();
        } else {
            showConfigMessage(result.error || 'Failed to save configuration', true);
        }
    } catch (error) {
        showConfigMessage(`Error saving configuration: ${error.message}`, true);
    }
}

async function testConnection() {
    clearConfigMessage();
    showConfigMessage('Testing connection...');
    
    const config = {};
    const openaiKey = document.getElementById('openai-key').value.trim();
    const azureKey = document.getElementById('azure-key').value.trim();
    const azureEndpoint = document.getElementById('azure-endpoint').value.trim();
    const azureDeployment = document.getElementById('azure-deployment').value.trim();
    
    if (openaiKey) {
        config.openai_api_key = openaiKey;
    } else if (azureKey) {
        config.azure_api_key = azureKey;
        if (azureEndpoint) config.azure_endpoint = azureEndpoint;
        if (azureDeployment) config.azure_deployment = azureDeployment;
    }
    
    try {
        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showConfigMessage(result.message);
        } else {
            showConfigMessage(result.error || 'Connection test failed', true);
        }
    } catch (error) {
        showConfigMessage(`Connection test error: ${error.message}`, true);
    }
}

async function clearApiConfig() {
    if (!confirm('Are you sure you want to clear all stored API keys? This cannot be undone.')) {
        return;
    }
    
    clearConfigMessage();
    
    try {
        const response = await fetch('/api/config', {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showConfigMessage(result.message);
            // Clear all input fields
            document.getElementById('openai-key').value = '';
            document.getElementById('openai-key').placeholder = 'sk-...';
            document.getElementById('azure-key').value = '';
            document.getElementById('azure-key').placeholder = 'Your Azure OpenAI key';
            document.getElementById('azure-endpoint').value = '';
            document.getElementById('azure-deployment').value = '';
            // Update main status
            checkStatus();
        } else {
            showConfigMessage(result.error || 'Failed to clear configuration', true);
        }
    } catch (error) {
        showConfigMessage(`Error clearing configuration: ${error.message}`, true);
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const configModal = document.getElementById('config-modal');
    const folderModal = document.getElementById('folder-browser-modal');
    
    if (event.target === configModal) {
        closeConfigModal();
    } else if (event.target === folderModal) {
        closeFolderBrowser();
    }
}

// Folder Browser Functions
let currentBrowsePath = '';

function openFolderBrowser() {
    document.getElementById('folder-browser-modal').style.display = 'flex';
    // Start with current codebase path or home directory
    const currentPath = document.getElementById('codebase-path').value || '.';
    loadDirectory(currentPath);
}

function closeFolderBrowser() {
    document.getElementById('folder-browser-modal').style.display = 'none';
}

async function loadDirectory(path) {
    const content = document.getElementById('browser-content');
    content.innerHTML = '<div class="loading-spinner">Loading directories...</div>';
    
    try {
        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load directory');
        }
        
        currentBrowsePath = data.current_path;
        updateBrowserDisplay(data);
        
    } catch (error) {
        content.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

function updateBrowserDisplay(data) {
    // Update current path display
    document.getElementById('current-path').textContent = data.current_path;
    document.getElementById('selected-path').textContent = data.current_path;
    
    // Enable/disable parent button
    const parentBtn = document.getElementById('parent-btn');
    parentBtn.disabled = !data.parent_path;
    
    // Enable select button
    document.getElementById('select-btn').disabled = false;
    
    // Render directory contents
    const content = document.getElementById('browser-content');
    if (data.items.length === 0) {
        content.innerHTML = '<div class="empty-directory">This directory is empty</div>';
        return;
    }
    
    const itemsHtml = data.items.map(item => {
        let icon, iconClass;
        if (item.is_directory) {
            if (item.has_code) {
                icon = '📂'; // Open folder for code directories
                iconClass = 'folder-code';
            } else {
                icon = '📁'; // Regular folder
                iconClass = 'folder';
            }
        } else {
            // Determine file icon based on extension
            const ext = item.name.split('.').pop().toLowerCase();
            if (['py'].includes(ext)) {
                icon = '🐍';
                iconClass = 'file-python';
            } else if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
                icon = '⚡';
                iconClass = 'file-js';
            } else if (['cpp', 'c', 'h', 'hpp'].includes(ext)) {
                icon = '⚙️';
                iconClass = 'file-c';
            } else if (['java'].includes(ext)) {
                icon = '☕';
                iconClass = 'file-java';
            } else if (['rs'].includes(ext)) {
                icon = '🦀';
                iconClass = 'file-rust';
            } else if (['go'].includes(ext)) {
                icon = '🔷';
                iconClass = 'file-go';
            } else if (['md', 'txt'].includes(ext)) {
                icon = '📝';
                iconClass = 'file-text';
            } else if (['json', 'yaml', 'yml', 'xml'].includes(ext)) {
                icon = '🔧';
                iconClass = 'file-config';
            } else {
                icon = '📄';
                iconClass = 'file';
            }
        }
        
        const codeIndicator = item.has_code ? '<span class="code-badge">CODE</span>' : '';
        const sizeText = item.is_directory ? '' : formatFileSize(item.size);
        
        return `
            <div class="browser-item ${item.is_directory ? 'directory' : 'file'}" 
                 onclick="${item.is_directory ? `loadDirectory('${item.path}')` : ''}"
                 ${item.is_directory ? 'style="cursor: pointer;"' : ''}>
                <div class="item-icon ${iconClass}">${icon}</div>
                <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    <div class="item-meta">
                        ${codeIndicator}
                        ${sizeText ? `<span class="file-size">${sizeText}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    content.innerHTML = itemsHtml;
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function navigateToParent() {
    const parentBtn = document.getElementById('parent-btn');
    if (!parentBtn.disabled) {
        // Get parent directory of current path
        const currentPath = currentBrowsePath;
        const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        loadDirectory(parentPath);
    }
}

function navigateToHome() {
    loadDirectory('~');  // This will resolve to home directory on the server
}

function selectCurrentFolder() {
    // Set the selected folder as the codebase path
    document.getElementById('codebase-path').value = currentBrowsePath;
    closeFolderBrowser();
    
    // Show a confirmation message
    showResults({
        success: true,
        stdout: `Selected folder: ${currentBrowsePath}\n\nYou can now proceed with indexing or analysis.`
    });
}