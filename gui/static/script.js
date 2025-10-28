let currentResultFile = null;
let currentResultData = null;
let currentAbortController = null;

// Check API status on load
window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    checkStatus();
    setupFileInputs();
    setupBackendToggle();
    loadStoredConfig();
    setupKeyboardShortcuts();
    setupAccessibility();
    setupRealTimeValidation();
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

function showLoading(message = 'Processing request...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = overlay.querySelector('p');
    messageEl.textContent = message;
    overlay.style.display = 'flex';

    // Create new AbortController for this operation
    currentAbortController = new AbortController();
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
    currentAbortController = null;
}

function cancelOperation() {
    if (currentAbortController) {
        currentAbortController.abort();
        hideLoading();
        showWarning('Operation cancelled by user', 'Cancelled');
    }
}

function showProgress(message, progress = null) {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = overlay.querySelector('p');
    const spinner = overlay.querySelector('.spinner');

    messageEl.textContent = message;
    overlay.style.display = 'flex';

    // Create new AbortController if not already created
    if (!currentAbortController) {
        currentAbortController = new AbortController();
    }

    if (progress !== null) {
        // Add progress bar if not exists
        let progressBar = overlay.querySelector('.progress-bar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.innerHTML = '<div class="progress-fill"></div>';
            overlay.appendChild(progressBar);
        }

        const progressFill = progressBar.querySelector('.progress-fill');
        progressFill.style.width = `${progress}%`;

        if (progress >= 100) {
            setTimeout(() => {
                progressBar.remove();
            }, 1000);
        }
    }
}

function showResults(data) {
    const resultsPanel = document.getElementById('results');
    const resultContent = document.getElementById('result-content');
    const downloadBtn = document.getElementById('download-btn');
    const downloadTextBtn = document.getElementById('download-text-btn');
    const controlsEl = document.getElementById('results-controls');

    resultsPanel.style.display = 'block';

    if (data.success) {
        if (data.results) {
            resultContent.innerHTML = formatResults(data.results);
            currentResultFile = data.output_file;
            currentResultData = data.results;
            downloadBtn.style.display = 'inline-block';
            downloadTextBtn.style.display = 'inline-block';

            // Show controls if there are issues
            const issues = document.querySelectorAll('.issue');
            if (issues.length > 0) {
                controlsEl.style.display = 'block';
                filterResults(); // Initialize stats
            }
        } else if (data.stdout) {
            const messageType = data.warning ? 'warning' : 'success';
            resultContent.innerHTML = `<div class="message ${messageType}">
                <div class="message-header">
                    <strong>${data.title || (data.warning ? 'Warning' : 'Success')}</strong>
                </div>
                <div class="message-content">${data.stdout}</div>
            </div>`;
            controlsEl.style.display = 'none';

            // Store data and show download buttons for stdout results too
            currentResultFile = data.output_file;
            currentResultData = data.stdout;
            if (data.output_file) {
                downloadBtn.style.display = 'inline-block';
            }
            downloadTextBtn.style.display = 'inline-block';
        } else {
            resultContent.innerHTML = `<div class="message success">
                <div class="message-header">
                    <strong>Success</strong>
                </div>
                <div class="message-content">Operation completed successfully.</div>
            </div>`;
            controlsEl.style.display = 'none';
        }
    } else {
        resultContent.innerHTML = `<div class="message error">
            <div class="message-header">
                <strong>${data.title || 'Error'}</strong>
            </div>
            <div class="message-content">${data.error || data.stderr || 'Unknown error occurred'}</div>
        </div>`;
        controlsEl.style.display = 'none';
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
    const severityIcon = getSeverityIcon(severity);
    
    return `
        <div class="issue" data-severity="${severity.toLowerCase()}">
            <div class="issue-header">
                <div class="issue-title">
                    <span class="severity-icon">${severityIcon}</span>
                    <strong>${issue.title || issue.message || 'Security Issue'}</strong>
                </div>
                <div class="issue-meta">
                    <span class="issue-severity ${severityClass}">${severity.toUpperCase()}</span>
                    <button class="btn btn-small btn-toggle" onclick="toggleIssueDetails(this)">Details</button>
                </div>
            </div>
            <div class="issue-details" style="display: none;">
                <div class="issue-location">
                    <span class="location-item">
                        <strong>📁 File:</strong> 
                        <code>${issue.file || 'N/A'}</code>
                    </span>
                    ${issue.line ? `<span class="location-item">
                        <strong>📍 Line:</strong> 
                        <code>${issue.line}</code>
                    </span>` : ''}
                </div>
                <div class="issue-description">
                    <strong>Description:</strong>
                    <p>${issue.description || issue.message || ''}</p>
                </div>
                ${issue.recommendation ? `
                <div class="issue-recommendation">
                    <strong>💡 Recommendation:</strong>
                    <p>${issue.recommendation}</p>
                </div>
                ` : ''}
                ${issue.code_snippet ? `
                <div class="issue-code">
                    <strong>Code:</strong>
                    <pre><code>${issue.code_snippet}</code></pre>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function getSeverityIcon(severity) {
    switch (severity.toLowerCase()) {
        case 'high': return '🔴';
        case 'medium': return '🟡';
        case 'low': return '🟢';
        default: return '⚪';
    }
}

function toggleIssueDetails(button) {
    const issue = button.closest('.issue');
    const details = issue.querySelector('.issue-details');
    const isVisible = details.style.display !== 'none';
    
    details.style.display = isVisible ? 'none' : 'block';
    button.textContent = isVisible ? 'Details' : 'Hide';
}

function clearResults() {
    document.getElementById('results').style.display = 'none';
    document.getElementById('result-content').innerHTML = '';
    document.getElementById('results-controls').style.display = 'none';
    document.getElementById('results-stats').style.display = 'none';
    currentResultFile = null;
    currentResultData = null;
    document.getElementById('download-btn').style.display = 'none';
    document.getElementById('download-text-btn').style.display = 'none';
    // Clear search and filter
    document.getElementById('result-search').value = '';
    document.getElementById('severity-filter').value = '';
}

function downloadResults() {
    if (currentResultFile) {
        window.open(`/api/download/${currentResultFile.split('/').pop()}`, '_blank');
    }
}

function downloadResultsAsText() {
    if (!currentResultData) {
        return;
    }

    let textContent = '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Convert results to text format
    if (Array.isArray(currentResultData)) {
        textContent = '='.repeat(80) + '\n';
        textContent += 'METIS SECURITY REVIEW RESULTS\n';
        textContent += '='.repeat(80) + '\n\n';
        textContent += `Generated: ${new Date().toLocaleString()}\n`;
        textContent += `Total Issues Found: ${currentResultData.length}\n`;
        textContent += '='.repeat(80) + '\n\n';

        currentResultData.forEach((issue, index) => {
            textContent += `\n${'─'.repeat(80)}\n`;
            textContent += `ISSUE #${index + 1}\n`;
            textContent += `${'─'.repeat(80)}\n\n`;

            textContent += `Severity: ${(issue.severity || 'MEDIUM').toUpperCase()}\n`;
            textContent += `Title: ${issue.title || issue.message || 'Security Issue'}\n`;

            if (issue.file) {
                textContent += `File: ${issue.file}\n`;
            }
            if (issue.line || issue.line_number) {
                textContent += `Line: ${issue.line || issue.line_number}\n`;
            }
            if (issue.cwe) {
                textContent += `CWE: ${issue.cwe}\n`;
            }

            textContent += `\nDescription:\n`;
            textContent += `${issue.description || issue.message || 'No description available'}\n`;

            if (issue.recommendation) {
                textContent += `\nRecommendation:\n`;
                textContent += `${issue.recommendation}\n`;
            }

            if (issue.code_snippet) {
                textContent += `\nCode Snippet:\n`;
                textContent += `${'-'.repeat(40)}\n`;
                textContent += `${issue.code_snippet}\n`;
                textContent += `${'-'.repeat(40)}\n`;
            }
        });

        textContent += `\n${'='.repeat(80)}\n`;
        textContent += `END OF REPORT\n`;
        textContent += `${'='.repeat(80)}\n`;
    } else if (typeof currentResultData === 'string') {
        // For text results like from Ask Question
        textContent = '='.repeat(80) + '\n';
        textContent += 'METIS SECURITY REVIEW RESULTS\n';
        textContent += '='.repeat(80) + '\n\n';
        textContent += `Generated: ${new Date().toLocaleString()}\n`;
        textContent += '='.repeat(80) + '\n\n';
        textContent += currentResultData;
        textContent += `\n\n${'='.repeat(80)}\n`;
        textContent += `END OF REPORT\n`;
        textContent += `${'='.repeat(80)}\n`;
    } else if (typeof currentResultData === 'object') {
        textContent = JSON.stringify(currentResultData, null, 2);
    } else {
        textContent = currentResultData.toString();
    }

    // Create and download the file
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metis-results-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function showError(message, title = 'Error') {
    showResults({ 
        success: false, 
        error: message,
        title: title
    });
}

function showSuccess(message, title = 'Success') {
    showResults({ 
        success: true, 
        stdout: message,
        title: title
    });
}

function showWarning(message, title = 'Warning') {
    showResults({ 
        success: true, 
        stdout: message,
        title: title,
        warning: true
    });
}

// API Functions
async function indexCodebase() {
    // Validate configuration before proceeding
    const validation = validateConfiguration();
    if (!showValidationErrors(validation.errors, validation.warnings)) {
        return;
    }
    
    showProgress('Starting codebase indexing...', 0);
    document.getElementById('index-progress').style.display = 'block';
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
        const currentProgress = Math.min(90, Math.random() * 20 + 10);
        showProgress('Indexing codebase... This may take several minutes.', currentProgress);
    }, 2000);
    
    try {
        const response = await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getConfig()),
            signal: currentAbortController.signal
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Show completion progress
        showProgress('Indexing completed! Processing results...', 100);
        
        setTimeout(() => {
            showResults(data);
        }, 1000);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            // Operation was cancelled, message already shown
            return;
        }
        showError(`Failed to index codebase: ${error.message}`, 'Indexing Failed');
    } finally {
        clearInterval(progressInterval);
        hideLoading();
        document.getElementById('index-progress').style.display = 'none';
    }
}

async function askQuestion() {
    const question = document.getElementById('question').value.trim();
    
    if (!question) {
        showError('Please enter a question', 'Input Required');
        return;
    }
    
    showLoading();
    
    try {
        const config = getConfig();
        config.question = question;
        
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            signal: currentAbortController.signal
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        showError(`Failed to process question: ${error.message}`, 'Question Processing Failed');
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
            body: formData,
            signal: currentAbortController.signal
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
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
            body: JSON.stringify(config),
            signal: currentAbortController.signal
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        showError(`Failed to review file: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function reviewCode() {
    if (!confirm('This will review your entire codebase and may take a long time. Continue?')) {
        return;
    }
    
    showProgress('Starting comprehensive security review...', 0);
    
    // Simulate progress for long-running operation
    const progressInterval = setInterval(() => {
        const currentProgress = Math.min(85, Math.random() * 15 + 5);
        showProgress('Analyzing codebase for security issues...', currentProgress);
    }, 3000);
    
    try {
        const response = await fetch('/api/review-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getConfig()),
            signal: currentAbortController.signal
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        showProgress('Review completed! Generating report...', 100);
        
        setTimeout(() => {
            showResults(data);
        }, 1000);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        showError(`Failed to review code: ${error.message}`, 'Code Review Failed');
    } finally {
        clearInterval(progressInterval);
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
            body: formData,
            signal: currentAbortController.signal
        });
        
        const data = await response.json();
        showResults(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
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
let browserMode = 'folder';
let browserTargetInput = 'codebase-path';
let selectedItemPath = '';
let selectedItemIsDirectory = true;

function openFolderBrowser() {
    openPathBrowser('folder', 'codebase-path');
}

function openFileBrowser() {
    openPathBrowser('file', 'file-path');
}

function openPathBrowser(mode, targetInputId) {
    browserMode = mode;
    browserTargetInput = targetInputId;
    selectedItemPath = '';
    selectedItemIsDirectory = mode === 'folder';

    const modal = document.getElementById('folder-browser-modal');
    modal.style.display = 'flex';

    const selectBtn = document.getElementById('select-btn');
    selectBtn.textContent = mode === 'folder' ? 'Select This Folder' : 'Select This File';
    selectBtn.disabled = mode === 'file';

    const titleEl = document.querySelector('#folder-browser-modal .modal-header h2');
    if (titleEl) {
        titleEl.textContent = mode === 'folder' ? '📁 Select Code Folder' : '📄 Select File';
    }

    const startInput = document.getElementById(targetInputId);
    const fallbackPath = document.getElementById('codebase-path')?.value || '.';
    const rawPath = startInput?.value?.trim() || fallbackPath;
    const startPath = mode === 'file' && rawPath ? rawPath.replace(/\\/g, '/') : rawPath;

    loadDirectory(resolveStartDirectory(startPath, mode));

    setTimeout(() => {
        const firstButton = document.querySelector('#folder-browser-modal .btn');
        if (firstButton) {
            firstButton.focus();
        }
    }, 100);
}

function resolveStartDirectory(path, mode) {
    if (!path) {
        return '.';
    }

    if (mode === 'file') {
        if (path.endsWith('/')) {
            return path;
        }
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash > 0) {
            return path.slice(0, lastSlash);
        }
        return '.';
    }

    return path;
}

function closeFolderBrowser() {
    document.getElementById('folder-browser-modal').style.display = 'none';
}

async function loadDirectory(path) {
    const content = document.getElementById('browser-content');
    content.innerHTML = '<div class="loading-spinner">Loading directories...</div>';
    if (browserMode === 'file') {
        selectedItemPath = '';
        selectedItemIsDirectory = false;
        const selectBtn = document.getElementById('select-btn');
        if (selectBtn) {
            selectBtn.disabled = true;
        }
    }
    
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
    
    const parentBtn = document.getElementById('parent-btn');
    parentBtn.disabled = !data.parent_path;

    if (browserMode === 'folder') {
        selectedItemPath = data.current_path;
        selectedItemIsDirectory = true;
        document.getElementById('selected-path').textContent = selectedItemPath;
        document.getElementById('select-btn').disabled = false;
    } else {
        // Preserve selection only if it belongs to current directory tree
        if (!selectedItemPath.startsWith(data.current_path)) {
            selectedItemPath = '';
        }
        selectedItemIsDirectory = false;
        document.getElementById('selected-path').textContent = selectedItemPath || 'Select a file';
        document.getElementById('select-btn').disabled = !selectedItemPath;
    }
    
    // Render directory contents
    const content = document.getElementById('browser-content');
    if (data.items.length === 0) {
        content.innerHTML = '<div class="empty-directory">This directory is empty</div>';
        return;
    }
    
    const itemsHtml = data.items.map((item, index) => {
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
                 data-path="${item.path.replace(/"/g, '&quot;')}"
                 data-name="${item.name.replace(/"/g, '&quot;')}"
                 data-is-directory="${item.is_directory}"
                 style="cursor: pointer;">
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

    // Add click event listeners to all browser items
    content.querySelectorAll('.browser-item').forEach(itemEl => {
        const path = itemEl.getAttribute('data-path');
        const name = itemEl.getAttribute('data-name');
        const isDirectory = itemEl.getAttribute('data-is-directory') === 'true';

        if (!isDirectory && browserMode === 'file' && path === selectedItemPath) {
            itemEl.classList.add('selected');
        }

        itemEl.addEventListener('click', () => {
            if (isDirectory) {
                loadDirectory(path);
            } else {
                if (browserMode === 'file') {
                    selectedItemPath = path;
                    selectedItemIsDirectory = false;
                    document.getElementById('selected-path').textContent = selectedItemPath;
                    document.getElementById('select-btn').disabled = false;
                    content.querySelectorAll('.browser-item').forEach(el => el.classList.remove('selected'));
                    itemEl.classList.add('selected');
                }
                previewFile(path, name);
            }
        });
    });
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
    const targetInput = document.getElementById(browserTargetInput);
    if (!targetInput) {
        closeFolderBrowser();
        return;
    }

    if (browserMode === 'file') {
        if (!selectedItemPath || selectedItemIsDirectory) {
            return;
        }
        targetInput.value = selectedItemPath;
        closeFolderBrowser();
        showResults({
            success: true,
            stdout: `Selected file: ${selectedItemPath}\n\nYou can now review this file.`
        });
    } else {
        targetInput.value = currentBrowsePath;
        closeFolderBrowser();
        showResults({
            success: true,
            stdout: `Selected folder: ${currentBrowsePath}\n\nYou can now proceed with indexing or analysis.`
        });
    }
}

// Result filtering and search functions
function filterResults() {
    const searchTerm = document.getElementById('result-search').value.toLowerCase();
    const severityFilter = document.getElementById('severity-filter').value;
    const issues = document.querySelectorAll('.issue');
    let visibleCount = 0;
    
    issues.forEach(issue => {
        const title = issue.querySelector('.issue-title strong').textContent.toLowerCase();
        const description = issue.querySelector('.issue-description p')?.textContent.toLowerCase() || '';
        const severity = issue.getAttribute('data-severity');
        
        const matchesSearch = !searchTerm || title.includes(searchTerm) || description.includes(searchTerm);
        const matchesSeverity = !severityFilter || severity === severityFilter;
        
        if (matchesSearch && matchesSeverity) {
            issue.style.display = 'block';
            visibleCount++;
        } else {
            issue.style.display = 'none';
        }
    });
    
    // Update stats
    const totalCount = issues.length;
    const statsEl = document.getElementById('results-stats');
    const countEl = document.getElementById('results-count');
    const filteredEl = document.getElementById('filtered-count');
    
    if (totalCount > 0) {
        statsEl.style.display = 'block';
        countEl.textContent = `${totalCount} issues found`;
        
        if (searchTerm || severityFilter) {
            filteredEl.style.display = 'inline';
            filteredEl.textContent = `${visibleCount} shown`;
        } else {
            filteredEl.style.display = 'none';
        }
    }
}

function expandAllIssues() {
    const details = document.querySelectorAll('.issue-details');
    const buttons = document.querySelectorAll('.btn-toggle');
    
    details.forEach(detail => {
        detail.style.display = 'block';
    });
    
    buttons.forEach(button => {
        button.textContent = 'Hide';
    });
}

function collapseAllIssues() {
    const details = document.querySelectorAll('.issue-details');
    const buttons = document.querySelectorAll('.btn-toggle');
    
    details.forEach(detail => {
        detail.style.display = 'none';
    });
    
    buttons.forEach(button => {
        button.textContent = 'Details';
    });
}


// Keyboard shortcuts and accessibility
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to submit forms
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                const submitBtn = activeTab.querySelector('.btn-primary');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                }
            }
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            const configModal = document.getElementById('config-modal');
            const folderModal = document.getElementById('folder-browser-modal');
            
            if (configModal.style.display === 'flex') {
                closeConfigModal();
            } else if (folderModal.style.display === 'flex') {
                closeFolderBrowser();
            }
        }
        
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('result-search');
            if (searchInput && searchInput.offsetParent !== null) {
                searchInput.focus();
            }
        }
        
        // Tab navigation shortcuts
        if (e.key === 'Tab') {
            // Add visual focus indicators
            document.body.classList.add('keyboard-navigation');
        }
    });
    
    // Remove keyboard navigation class on mouse use
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-navigation');
    });
}

function setupAccessibility() {
    // Add ARIA labels and roles
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach((tab, index) => {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', tab.classList.contains('active'));
        tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    });
    
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach((content, index) => {
        content.setAttribute('role', 'tabpanel');
        content.setAttribute('aria-labelledby', `tab-${index}`);
    });
    
    // Add skip links
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    skipLink.className = 'skip-link';
    skipLink.style.cssText = `
        position: absolute;
        top: -40px;
        left: 6px;
        background: var(--primary-color);
        color: white;
        padding: 8px;
        text-decoration: none;
        border-radius: 4px;
        z-index: 10000;
        transition: top 0.3s;
    `;
    skipLink.addEventListener('focus', () => {
        skipLink.style.top = '6px';
    });
    skipLink.addEventListener('blur', () => {
        skipLink.style.top = '-40px';
    });
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Add main content ID
    const mainContent = document.querySelector('.container');
    if (mainContent) {
        mainContent.id = 'main-content';
    }
    
    // Improve form accessibility
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) {
                input.setAttribute('aria-labelledby', label.id || `label-${input.id}`);
                if (!label.id) {
                    label.id = `label-${input.id}`;
                }
            }
        }
    });
    
    // Add loading announcements for screen readers
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.setAttribute('role', 'status');
        loadingOverlay.setAttribute('aria-live', 'polite');
    }
}

// Enhanced tab navigation
function openTab(evt, tabName) {
    const tabContents = document.getElementsByClassName('tab-content');
    for (let content of tabContents) {
        content.classList.remove('active');
        content.setAttribute('aria-hidden', 'true');
    }
    
    const tabButtons = document.getElementsByClassName('tab-button');
    for (let button of tabButtons) {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('tabindex', '-1');
    }
    
    const targetTab = document.getElementById(tabName);
    const targetButton = evt.currentTarget;
    
    targetTab.classList.add('active');
    targetTab.setAttribute('aria-hidden', 'false');
    targetButton.classList.add('active');
    targetButton.setAttribute('aria-selected', 'true');
    targetButton.setAttribute('tabindex', '0');
    
    // Focus management
    targetButton.focus();
}

// Add focus management for modals
function openConfigModal() {
    document.getElementById('config-modal').style.display = 'flex';
    loadStoredConfig();
    
    // Focus first input
    setTimeout(() => {
        const firstInput = document.querySelector('#config-modal input');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function openFolderBrowser() {
    openPathBrowser('folder', 'codebase-path');
}


// Enhanced folder browser with file preview
function previewFile(filePath, fileName) {
    const preview = document.getElementById('file-preview');
    const content = document.getElementById('preview-content');
    const filename = document.getElementById('preview-filename');
    
    preview.style.display = 'block';
    filename.textContent = fileName;
    content.innerHTML = '<div class="loading-spinner">Loading file...</div>';
    
    // Fetch file content
    fetch(`/api/preview-file?path=${encodeURIComponent(filePath)}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const fileContent = data.content;
                const fileType = getFileType(fileName);
                
                if (fileType === 'text') {
                    content.innerHTML = `<pre><code>${escapeHtml(fileContent)}</code></pre>`;
                } else if (fileType === 'image') {
                    content.innerHTML = `<img src="data:image/${getImageType(fileName)};base64,${fileContent}" alt="${fileName}" style="max-width: 100%; height: auto;">`;
                } else {
                    content.innerHTML = `<div class="preview-binary">
                        <p>Binary file preview not available</p>
                        <p><strong>File:</strong> ${fileName}</p>
                        <p><strong>Size:</strong> ${formatFileSize(data.size || 0)}</p>
                    </div>`;
                }
            } else {
                content.innerHTML = `<div class="error-message">Error loading file: ${data.error}</div>`;
            }
        })
        .catch(error => {
            content.innerHTML = `<div class="error-message">Error loading file: ${error.message}</div>`;
        });
}

function closeFilePreview() {
    document.getElementById('file-preview').style.display = 'none';
}

function getFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const textExts = ['txt', 'md', 'py', 'js', 'ts', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'c', 'cpp', 'h', 'hpp', 'java', 'rs', 'go', 'php', 'rb', 'cs', 'kt', 'swift'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    
    if (textExts.includes(ext)) return 'text';
    if (imageExts.includes(ext)) return 'image';
    return 'binary';
}

function getImageType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'svg') return 'svg+xml';
    return ext;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enhanced browser item click handling
function handleBrowserItemClick(item, isDirectory) {
    if (isDirectory) {
        loadDirectory(item.path);
    } else {
        // Preview file
        previewFile(item.path, item.name);
    }
}


// Configuration validation
function validateConfiguration() {
    const errors = [];
    const warnings = [];
    
    // Validate codebase path
    const codebasePath = document.getElementById('codebase-path').value.trim();
    if (!codebasePath) {
        errors.push('Codebase path is required');
    } else if (codebasePath === '.') {
        warnings.push('Using current directory as codebase path');
    }
    
    // Validate project schema
    const projectSchema = document.getElementById('project-schema').value.trim();
    if (!projectSchema) {
        errors.push('Project schema is required');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(projectSchema)) {
        errors.push('Project schema must contain only letters, numbers, hyphens, and underscores');
    }
    
    // Validate ChromaDB directory if using ChromaDB backend
    const backend = document.getElementById('backend').value;
    if (backend === 'chroma') {
        const chromaDir = document.getElementById('chroma-dir').value.trim();
        if (!chromaDir) {
            errors.push('ChromaDB directory is required when using ChromaDB backend');
        }
    }
    
    return { errors, warnings };
}

function showValidationErrors(errors, warnings) {
    let message = '';
    
    if (errors.length > 0) {
        message += 'Please fix the following errors:\n\n';
        errors.forEach(error => message += `• ${error}\n`);
    }
    
    if (warnings.length > 0) {
        message += '\nWarnings:\n\n';
        warnings.forEach(warning => message += `• ${warning}\n`);
    }
    
    if (errors.length > 0) {
        showError(message, 'Configuration Errors');
        return false;
    } else if (warnings.length > 0) {
        showWarning(message, 'Configuration Warnings');
        return true;
    }
    
    return true;
}

// Enhanced API key validation
function validateApiKey(key, type) {
    if (!key || key.trim() === '') {
        return { valid: false, message: `${type} API key is required` };
    }
    
    const trimmedKey = key.trim();
    
    if (type === 'OpenAI') {
        if (!trimmedKey.startsWith('sk-')) {
            return { valid: false, message: 'OpenAI API key must start with "sk-"' };
        }
        if (trimmedKey.length < 20) {
            return { valid: false, message: 'OpenAI API key appears to be too short' };
        }
    } else if (type === 'Azure') {
        if (trimmedKey.length < 10) {
            return { valid: false, message: 'Azure API key appears to be too short' };
        }
    }
    
    return { valid: true };
}

// Enhanced configuration save with validation
async function saveApiConfigWithValidation() {
    clearConfigMessage();
    
    const openaiKey = document.getElementById('openai-key').value.trim();
    const azureKey = document.getElementById('azure-key').value.trim();
    const azureEndpoint = document.getElementById('azure-endpoint').value.trim();
    const azureDeployment = document.getElementById('azure-deployment').value.trim();
    
    // Validate API keys
    if (openaiKey) {
        const validation = validateApiKey(openaiKey, 'OpenAI');
        if (!validation.valid) {
            showConfigMessage(validation.message, true);
            return;
        }
    }
    
    if (azureKey) {
        const validation = validateApiKey(azureKey, 'Azure');
        if (!validation.valid) {
            showConfigMessage(validation.message, true);
            return;
        }
        
        if (azureKey && !azureEndpoint) {
            showConfigMessage('Azure endpoint is required when using Azure API key', true);
            return;
        }
        
        if (azureKey && !azureDeployment) {
            showConfigMessage('Azure deployment name is required when using Azure API key', true);
            return;
        }
    }
    
    if (!openaiKey && !azureKey) {
        showConfigMessage('Please enter at least one API key', true);
        return;
    }
    
    // Proceed with saving
    await saveApiConfig();
}

// Real-time validation
function setupRealTimeValidation() {
    // Validate on input change
    const inputs = ['codebase-path', 'project-schema', 'chroma-dir'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('blur', () => {
                validateSingleField(id);
            });
        }
    });
    
    // Validate API keys on input
    const apiInputs = ['openai-key', 'azure-key', 'azure-endpoint', 'azure-deployment'];
    apiInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('blur', () => {
                validateApiField(id);
            });
        }
    });
}

function validateSingleField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value.trim();
    
    // Remove existing validation classes
    field.classList.remove('field-error', 'field-warning');
    
    let isValid = true;
    let message = '';
    
    switch (fieldId) {
        case 'codebase-path':
            if (!value) {
                isValid = false;
                message = 'Codebase path is required';
            }
            break;
        case 'project-schema':
            if (!value) {
                isValid = false;
                message = 'Project schema is required';
            } else if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                isValid = false;
                message = 'Project schema must contain only letters, numbers, hyphens, and underscores';
            }
            break;
        case 'chroma-dir':
            if (document.getElementById('backend').value === 'chroma' && !value) {
                isValid = false;
                message = 'ChromaDB directory is required when using ChromaDB backend';
            }
            break;
    }
    
    if (!isValid) {
        field.classList.add('field-error');
        showFieldError(field, message);
    }
}

function validateApiField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value.trim();
    
    // Remove existing validation classes
    field.classList.remove('field-error', 'field-warning');
    
    if (!value) return;
    
    let validation = { valid: true };
    
    switch (fieldId) {
        case 'openai-key':
            validation = validateApiKey(value, 'OpenAI');
            break;
        case 'azure-key':
            validation = validateApiKey(value, 'Azure');
            break;
        case 'azure-endpoint':
            if (value && !value.startsWith('http')) {
                validation = { valid: false, message: 'Azure endpoint must be a valid URL' };
            }
            break;
    }
    
    if (!validation.valid) {
        field.classList.add('field-error');
        showFieldError(field, validation.message);
    }
}

function showFieldError(field, message) {
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.field-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Add new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'color: var(--error-color); font-size: 0.8rem; margin-top: 4px;';
    
    field.parentNode.appendChild(errorDiv);
    
    // Remove error after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
        field.classList.remove('field-error');
    }, 5000);
}


// Dark mode and theme functionality
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('metis-theme', newTheme);
    
    // Update theme toggle button
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    themeToggle.title = newTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function loadTheme() {
    const savedTheme = localStorage.getItem('metis-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update theme toggle button
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('metis-theme')) {
        loadTheme();
    }
});
