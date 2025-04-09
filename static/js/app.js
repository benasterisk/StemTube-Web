/**
 * StemTubes Web - Main JavaScript
 * Handles UI interactions, API calls, and WebSocket communication
 */

// Global variables
let socket;
let currentVideoId = null;
let currentExtractionItem = null;
let appConfig = {};
let searchResults = [];
let searchResultsPage = 1;
let searchResultsPerPage = 10;
let totalSearchResults = 0;
let searchQuery = '';
let searchMode = 'search'; // 'search' or 'url'

// CSRF protection has been disabled for this application
function getCsrfToken() {
    // Return empty string since CSRF is disabled
    return '';
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO
    initializeSocketIO();
    
    // Load initial configuration
    loadConfig();
    
    // Initialize UI event listeners
    initializeEventListeners();
    
    // Load existing downloads and extractions
    loadDownloads();
    loadExtractions();
});

// Socket.IO Initialization
function initializeSocketIO() {
    // Configuration optimisée pour la stabilité des connexions
    socket = io({
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 60000  // Augmenter le timeout à 60 secondes
    });
    
    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to server via WebSocket');
        showToast('Connected to server', 'success');
        
        // Recharger les téléchargements et extractions à la reconnexion
        loadDownloads();
        loadExtractions();
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showToast('Connection error: ' + error.message, 'error');
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        showToast('Disconnected from server', 'warning');
    });
    
    // Set up authentication error handling
    if (window.setupSocketAuthHandling) {
        window.setupSocketAuthHandling(socket);
    }
    
    // Download events
    socket.on('download_progress', (data) => {
        console.log('Download progress:', data);
        updateDownloadProgress(data);
    });
    
    socket.on('download_complete', (data) => {
        console.log('Download complete:', data);
        updateDownloadComplete(data);
    });
    
    socket.on('download_error', (data) => {
        console.error('Download error:', data);
        updateDownloadError(data);
    });
    
    // Extraction events
    socket.on('extraction_progress', (data) => {
        console.log('Extraction progress:', data);
        updateExtractionProgress(data);
    });
    
    socket.on('extraction_complete', (data) => {
        console.log('Extraction complete:', data);
        updateExtractionComplete(data);
    });
    
    socket.on('extraction_error', (data) => {
        console.error('Extraction error:', data);
        updateExtractionError(data);
    });
}

// Load Configuration
function loadConfig() {
    fetch('/api/config', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            appConfig = data;
            
            // Apply theme
            if (appConfig.theme === 'light') {
                document.body.classList.add('light-theme');
                document.getElementById('themeSelect').value = 'light';
            } else {
                document.body.classList.remove('light-theme');
                document.getElementById('themeSelect').value = 'dark';
            }
            
            // Apply other settings
            document.getElementById('downloadsDirectory').value = appConfig.downloads_directory || '';
            document.getElementById('maxConcurrentDownloads').value = appConfig.max_concurrent_downloads || 3;
            document.getElementById('preferredVideoQuality').value = appConfig.preferred_video_quality || '720p';
            document.getElementById('preferredAudioQuality').value = appConfig.preferred_audio_quality || 'best';
            document.getElementById('useGpuForExtraction').checked = appConfig.use_gpu_for_extraction !== false;
            document.getElementById('defaultStemModel').value = appConfig.default_stem_model || 'htdemucs';
            
            // Update GPU status
            updateGpuStatus();
            
            // Check FFmpeg status
            checkFfmpegStatus();
        })
        .catch(error => {
            console.error('Error loading configuration:', error);
            showToast('Error loading configuration', 'error');
        });
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Search mode toggle
    document.querySelectorAll('#searchMode .segment').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#searchMode .segment').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            searchMode = button.dataset.mode;
            
            // Update search input placeholder
            if (searchMode === 'search') {
                document.getElementById('searchInput').placeholder = 'Search YouTube...';
            } else {
                document.getElementById('searchInput').placeholder = 'Enter YouTube URL or video ID...';
            }
        });
    });
    
    // Search button
    document.getElementById('searchButton').addEventListener('click', () => {
        performSearch();
    });
    
    // Search input (Enter key)
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Update active tab button
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(`${tabId}Tab`).classList.add('active');
        });
    });
    
    // Settings button
    document.getElementById('settingsButton').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'flex';
    });
    
    // Close buttons for modals
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Save settings button
    document.getElementById('saveSettingsButton').addEventListener('click', () => {
        saveSettings();
    });
    
    // Download FFmpeg button
    document.getElementById('downloadFfmpegButton').addEventListener('click', () => {
        downloadFfmpeg();
    });
    
    // Download type change (audio/video)
    document.getElementById('downloadType').addEventListener('change', () => {
        const downloadType = document.getElementById('downloadType').value;
        
        if (downloadType === 'audio') {
            document.getElementById('videoQualityContainer').style.display = 'none';
            document.getElementById('audioQualityContainer').style.display = 'block';
        } else {
            document.getElementById('videoQualityContainer').style.display = 'block';
            document.getElementById('audioQualityContainer').style.display = 'none';
        }
    });
    
    // Two-stem mode toggle
    document.getElementById('twoStemMode').addEventListener('change', () => {
        const twoStemMode = document.getElementById('twoStemMode').checked;
        
        if (twoStemMode) {
            document.getElementById('primaryStemContainer').style.display = 'block';
        } else {
            document.getElementById('primaryStemContainer').style.display = 'none';
        }
    });
    
    // Start download button
    document.getElementById('startDownloadButton').addEventListener('click', () => {
        startDownload();
    });
    
    // Start extraction button
    document.getElementById('startExtractionButton').addEventListener('click', () => {
        startExtraction();
    });
    
    // Model selection change event
    document.getElementById('stemModel').addEventListener('change', () => {
        updateStemOptions();
        updateModelDescription();
    });
}

// Search Functions
function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        showToast('Please enter a search query', 'warning');
        return;
    }
    
    console.log('Performing search for query:', query);
    console.log('Search mode:', searchMode);
    
    // Show loading state
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="loading-indicator">Searching...</div>';
    
    // Determine search mode (search or URL)
    const searchParams = new URLSearchParams();
    
    if (searchMode === 'search') {
        // Regular search
        searchParams.append('query', query);
        searchParams.append('max_results', 10);
        
        const searchUrl = `/api/search?${searchParams.toString()}`;
        console.log('Fetching from URL:', searchUrl);
        
        fetch(searchUrl, {
            headers: {
                'X-CSRF-Token': getCsrfToken()
            }
        })
            .then(response => {
                console.log('Search API response status:', response.status);
                if (!response.ok) {
                    if (response.status === 401) {
                        // Handle authentication error
                        return response.json().then(data => {
                            throw new Error('Authentication required');
                        });
                    }
                    throw new Error(`Search failed with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Search API response data:', data);
                displaySearchResults(data);
            })
            .catch(error => {
                console.error('Search error:', error);
                resultsContainer.innerHTML = `<div class="error-message">Search error: ${error.message}</div>`;
                showToast(`Search error: ${error.message}`, 'error');
            });
    } else {
        // URL/ID mode - direct video lookup
        const videoId = extractVideoId(query);
        if (videoId) {
            const videoUrl = `/api/video/${videoId}`;
            console.log('Fetching video info from URL:', videoUrl);
            
            fetch(videoUrl, {
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            })
                .then(response => {
                    console.log('Video API response status:', response.status);
                    if (!response.ok) {
                        if (response.status === 401) {
                            // Handle authentication error
                            return response.json().then(data => {
                                throw new Error('Authentication required');
                            });
                        }
                        throw new Error(`Video lookup failed with status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Video API response data:', data);
                    // Format the response to match search results format
                    const formattedData = {
                        items: [data]
                    };
                    displaySearchResults(formattedData);
                })
                .catch(error => {
                    console.error('Video lookup error:', error);
                    resultsContainer.innerHTML = `<div class="error-message">Video lookup error: ${error.message}</div>`;
                    showToast(`Video lookup error: ${error.message}`, 'error');
                });
        } else {
            resultsContainer.innerHTML = '<div class="error-message">Invalid YouTube URL or video ID</div>';
            showToast('Invalid YouTube URL or video ID', 'error');
        }
    }
}

// Helper function to get the best thumbnail URL
function getThumbnailUrl(item) {
    // Handle different API response structures
    if (item.snippet && item.snippet.thumbnails) {
        const thumbnails = item.snippet.thumbnails;
        return thumbnails.medium?.url || thumbnails.default?.url || '';
    } else if (item.thumbnails && Array.isArray(item.thumbnails)) {
        // Find a thumbnail with width between 200 and 400px
        const mediumThumbnail = item.thumbnails.find(thumb => 
            thumb.width >= 200 && thumb.width <= 400
        );
        
        if (mediumThumbnail) {
            return mediumThumbnail.url;
        }
        
        // Fallback to the first thumbnail
        return item.thumbnails[0]?.url || '';
    } else if (item.thumbnail) {
        return item.thumbnail;
    }
    
    return '';
}

// Helper function to format duration
function formatDuration(duration) {
    if (!duration) return 'Unknown';
    
    // Handle ISO 8601 duration format (PT1H2M3S)
    if (typeof duration === 'string' && duration.startsWith('PT')) {
        const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        
        if (matches) {
            const hours = matches[1] ? parseInt(matches[1]) : 0;
            const minutes = matches[2] ? parseInt(matches[2]) : 0;
            const seconds = matches[3] ? parseInt(matches[3]) : 0;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
    
    // Handle seconds format
    if (!isNaN(duration)) {
        const totalSeconds = parseInt(duration);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    // Handle MM:SS format that might be incorrectly formatted (e.g., 0:296)
    if (typeof duration === 'string' && duration.includes(':')) {
        const parts = duration.split(':');
        if (parts.length === 2) {
            let minutes = parseInt(parts[0]);
            let seconds = parseInt(parts[1]);
            
            // Convertir les secondes excédentaires en minutes
            if (seconds >= 60) {
                minutes += Math.floor(seconds / 60);
                seconds = seconds % 60;
            }
            
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    return duration;
}

// Download Modal Functions
function openDownloadModal(videoId, title, thumbnailUrl) {
    console.log('Opening download modal with:', { videoId, title, thumbnailUrl });
    
    // Stocker l'ID décodé
    currentVideoId = videoId;
    console.log('Set currentVideoId to:', currentVideoId);
    
    document.getElementById('downloadTitle').textContent = title;
    document.getElementById('downloadThumbnail').src = thumbnailUrl;
    
    // Set default values from settings
    document.getElementById('downloadType').value = 'audio';
    document.getElementById('videoQuality').value = appConfig.preferred_video_quality || '720p';
    document.getElementById('audioQuality').value = appConfig.preferred_audio_quality || 'best';
    
    // Show/hide quality options based on download type
    document.getElementById('videoQualityContainer').style.display = 'none';
    document.getElementById('audioQualityContainer').style.display = 'block';
    
    // Show modal
    document.getElementById('downloadModal').style.display = 'flex';
}

function startDownload() {
    console.log('Starting download with currentVideoId:', currentVideoId);
    
    if (!currentVideoId) {
        showToast('No video selected', 'error');
        return;
    }
    
    const downloadType = document.getElementById('downloadType').value;
    const quality = downloadType === 'audio' 
        ? document.getElementById('audioQuality').value 
        : document.getElementById('videoQuality').value;
    const title = document.getElementById('downloadTitle').textContent;
    const thumbnailUrl = document.getElementById('downloadThumbnail').src;
    
    console.log('Download parameters:', { 
        downloadType, 
        quality, 
        title, 
        thumbnailUrl 
    });
    
    // Create download item
    const downloadItem = {
        video_id: currentVideoId,
        title: title,
        thumbnail_url: thumbnailUrl,
        download_type: downloadType,
        quality: quality
    };
    
    console.log('Sending download request with data:', downloadItem);
    
    // Add to queue
    fetch('/api/downloads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(downloadItem)
    })
    .then(response => {
        console.log('Download API response status:', response.status);
        
        // Vérifier si la réponse est OK
        if (!response.ok) {
            if (response.status === 401) {
                // Erreur d'authentification
                return response.json().then(data => {
                    throw new Error('Authentication required');
                }).catch(e => {
                    // Si le parsing JSON échoue, c'est probablement une page HTML
                    throw new Error(`Authentication required (${response.status})`);
                });
            }
            
            // Autres erreurs
            return response.text().then(text => {
                // Essayer de parser en JSON si possible
                try {
                    const data = JSON.parse(text);
                    throw new Error(data.error || `Server error: ${response.status}`);
                } catch (e) {
                    // Si ce n'est pas du JSON, c'est probablement une page HTML
                    console.error('Response is not JSON:', text.substring(0, 100) + '...');
                    throw new Error(`Server error: ${response.status}`);
                }
            });
        }
        
        return response.json();
    })
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        // Add to UI
        const downloadElement = createDownloadElement({
            download_id: data.download_id,
            video_id: currentVideoId,
            title: title,
            status: 'queued',
            progress: 0,
            speed: '0 KB/s',
            eta: 'Unknown',
            file_path: '',
            error_message: ''
        });
        
        document.getElementById('downloadsContainer').appendChild(downloadElement);
        
        // Close modal
        document.getElementById('downloadModal').style.display = 'none';
        
        // Show toast
        showToast('Download added to queue', 'success');
        
        // Switch to downloads tab
        document.querySelector('.tab-button[data-tab="downloads"]').click();
    })
    .catch(error => {
        console.error('Error adding download:', error);
        showToast(`Error adding download: ${error.message}`, 'error');
    });
}

// Extraction Modal Functions
function openExtractionModal(downloadId, title, filePath) {
    currentExtractionItem = {
        download_id: downloadId,
        title: title,
        audio_path: filePath
    };
    
    document.getElementById('extractionTitle').textContent = title;
    document.getElementById('extractionPath').textContent = filePath;
    
    // Set default values from settings
    document.getElementById('stemModel').value = appConfig.default_stem_model || 'htdemucs';
    
    // Mettre à jour les stems disponibles en fonction du modèle
    updateStemOptions();
    
    // Mettre à jour la description du modèle
    updateModelDescription();
    
    document.getElementById('twoStemMode').checked = false;
    document.getElementById('primaryStemContainer').style.display = 'none';
    document.getElementById('primaryStem').value = 'vocals';
    
    // Show modal
    document.getElementById('extractionModal').style.display = 'flex';
}

// Fonction pour charger la description du modèle sélectionné
function updateModelDescription() {
    const modelSelect = document.getElementById('stemModel');
    const selectedModel = modelSelect.value;
    const modelDescriptionElement = document.getElementById('modelDescription');
    
    // Dictionnaire des descriptions des modèles
    const modelDescriptions = {
        'htdemucs': 'Modèle de haute qualité pour la séparation en 4 stems (voix, batterie, basse, autres)',
        'htdemucs_ft': 'Version fine-tuned du modèle HTDemucs avec une meilleure qualité pour les 4 stems',
        'htdemucs_6s': 'Modèle avancé pour la séparation en 6 stems (voix, batterie, basse, guitare, piano, autres)',
        'mdx_extra': 'Modèle MDX avec une séparation plus précise des voix',
        'mdx_extra_q': 'Version optimisée du modèle MDX pour une qualité supérieure avec un coût de calcul plus élevé'
    };
    
    // Mettre à jour la description
    modelDescriptionElement.textContent = modelDescriptions[selectedModel] || '';
}

// Fonction pour mettre à jour les options de stems en fonction du modèle sélectionné
function updateStemOptions() {
    const modelSelect = document.getElementById('stemModel');
    const selectedModel = modelSelect.value;
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const stemCheckboxes = document.getElementById('stemCheckboxes');
    
    // Récupérer les stems disponibles depuis l'attribut data-stems
    const availableStems = selectedOption.getAttribute('data-stems') ? 
                          selectedOption.getAttribute('data-stems').split(',') : 
                          ['vocals', 'drums', 'bass', 'other'];
    
    // Vider le conteneur des checkboxes
    stemCheckboxes.innerHTML = '';
    
    // Créer les checkboxes pour chaque stem disponible
    availableStems.forEach(stem => {
        const stemId = `${stem}Checkbox`;
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'stem-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = stemId;
        checkbox.checked = true;
        
        const label = document.createElement('label');
        label.htmlFor = stemId;
        label.textContent = stem.charAt(0).toUpperCase() + stem.slice(1); // Capitalize first letter
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        stemCheckboxes.appendChild(checkboxDiv);
    });
    
    // Mettre à jour également les options dans le sélecteur primaryStem
    const primaryStemSelect = document.getElementById('primaryStem');
    primaryStemSelect.innerHTML = '';
    
    availableStems.forEach(stem => {
        const option = document.createElement('option');
        option.value = stem;
        option.textContent = stem.charAt(0).toUpperCase() + stem.slice(1);
        primaryStemSelect.appendChild(option);
    });
    
    // Sélectionner 'vocals' par défaut si disponible
    if (availableStems.includes('vocals')) {
        primaryStemSelect.value = 'vocals';
    }
}

function startExtraction() {
    if (!currentExtractionItem) {
        showToast('No audio file selected', 'error');
        return;
    }
    
    const modelName = document.getElementById('stemModel').value;
    const twoStemMode = document.getElementById('twoStemMode').checked;
    const primaryStem = document.getElementById('primaryStem').value;
    
    // Get selected stems from dynamically created checkboxes
    const selectedStems = [];
    const checkboxes = document.querySelectorAll('#stemCheckboxes input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            // Extract stem name from ID (remove 'Checkbox' suffix)
            const stemName = checkbox.id.replace('Checkbox', '');
            selectedStems.push(stemName);
        }
    });
    
    if (selectedStems.length === 0) {
        showToast('Please select at least one stem to extract', 'warning');
        return;
    }
    
    // Create extraction item
    const extractionItem = {
        audio_path: currentExtractionItem.audio_path,
        model_name: modelName,
        selected_stems: selectedStems,
        two_stem_mode: twoStemMode,
        primary_stem: primaryStem
    };
    
    // Add to queue
    fetch('/api/extractions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(extractionItem)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        // Add to UI
        const extractionElement = createExtractionElement({
            extraction_id: data.extraction_id,
            audio_path: currentExtractionItem.audio_path,
            title: currentExtractionItem.title,
            model_name: modelName,
            status: 'queued',
            progress: 0,
            output_paths: {},
            error_message: ''
        });
        
        document.getElementById('extractionsContainer').appendChild(extractionElement);
        
        // Close modal
        document.getElementById('extractionModal').style.display = 'none';
        
        // Show toast
        showToast('Extraction added to queue', 'success');
        
        // Switch to extractions tab
        document.querySelector('.tab-button[data-tab="extractions"]').click();
    })
    .catch(error => {
        console.error('Error adding extraction:', error);
        showToast('Error adding extraction', 'error');
    });
}

// Download and Extraction Management
function loadDownloads() {
    fetch('/api/downloads', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    // Handle authentication error
                    return response.json().then(data => {
                        throw new Error('Authentication required');
                    });
                }
                throw new Error(`Failed to load downloads: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const downloadsContainer = document.getElementById('downloadsContainer');
            downloadsContainer.innerHTML = '';
            
            if (data.length === 0) {
                downloadsContainer.innerHTML = '<div class="empty-state">No downloads yet</div>';
                return;
            }
            
            // Sort downloads by creation time (newest first)
            data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            data.forEach(item => {
                const downloadElement = createDownloadElement(item);
                downloadsContainer.appendChild(downloadElement);
            });
        })
        .catch(error => {
            console.error('Error loading downloads:', error);
            document.getElementById('downloadsContainer').innerHTML = 
                `<div class="error-message">Failed to load downloads: ${error.message}</div>`;
            showToast(`Failed to load downloads: ${error.message}`, 'error');
        });
}

function loadExtractions() {
    fetch('/api/extractions', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    // Handle authentication error
                    return response.json().then(data => {
                        throw new Error('Authentication required');
                    });
                }
                throw new Error(`Failed to load extractions: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const extractionsContainer = document.getElementById('extractionsContainer');
            extractionsContainer.innerHTML = '';
            
            if (data.length === 0) {
                extractionsContainer.innerHTML = '<div class="empty-state">No extractions yet</div>';
                return;
            }
            
            // Sort extractions by creation time (newest first)
            data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            data.forEach(item => {
                const extractionElement = createExtractionElement(item);
                extractionsContainer.appendChild(extractionElement);
            });
        })
        .catch(error => {
            console.error('Error loading extractions:', error);
            document.getElementById('extractionsContainer').innerHTML = 
                `<div class="error-message">Failed to load extractions: ${error.message}</div>`;
            showToast(`Failed to load extractions: ${error.message}`, 'error');
        });
}

function createDownloadElement(item) {
    const downloadElement = document.createElement('div');
    downloadElement.className = 'download-item';
    downloadElement.id = `download-${item.download_id}`;
    
    const statusClass = getStatusClass(item.status);
    const statusText = getStatusText(item.status);
    
    downloadElement.innerHTML = `
        <div class="item-header">
            <div class="item-title">${item.title}</div>
            <div class="item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="progress-info">
                <span class="progress-percentage">${item.progress}%</span>
                <span class="progress-details">${item.speed} - ${item.eta}</span>
            </div>
        </div>
        <div class="item-actions">
            ${item.status === 'completed' ? `
                <button class="item-button extract-button" data-download-id="${item.download_id}" data-title="${item.title}" data-file-path="${item.file_path}">
                    <i class="fas fa-music"></i> Extract Stems
                </button>
                <button class="item-button open-folder-button" data-file-path="${item.file_path}">
                    <i class="fas fa-download"></i> Get File
                </button>
            ` : ''}
            ${item.status === 'downloading' || item.status === 'queued' ? `
                <button class="item-button cancel cancel-download-button" data-download-id="${item.download_id}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            ` : ''}
            ${item.status === 'error' ? `
                <div class="error-message">${item.error_message}</div>
                <button class="item-button retry-button" data-download-id="${item.download_id}">
                    <i class="fas fa-redo"></i> Retry
                </button>
            ` : ''}
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        const extractButton = downloadElement.querySelector('.extract-button');
        if (extractButton) {
            extractButton.addEventListener('click', () => {
                openExtractionModal(
                    extractButton.dataset.downloadId,
                    extractButton.dataset.title,
                    extractButton.dataset.filePath
                );
            });
        }
        
        const openFolderButton = downloadElement.querySelector('.open-folder-button');
        if (openFolderButton) {
            openFolderButton.addEventListener('click', () => {
                const filePath = openFolderButton.dataset.filePath;
                const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'));
                const title = downloadElement.querySelector('.item-title').textContent;
                
                // Déterminer si l'utilisateur est local ou distant
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                if (isLocalhost) {
                    // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                    console.log(`Opening folder locally: ${folderPath}`);
                    
                    fetch('/api/open-folder', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': getCsrfToken()
                        },
                        body: JSON.stringify({ folder_path: folderPath })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log('Folder opened successfully');
                            showToast('Folder opened successfully', 'success');
                        } else {
                            // Si l'ouverture locale échoue, afficher la modale de téléchargement
                            console.error('Error opening folder:', data.message);
                            showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                            showFilesModal(folderPath, title);
                        }
                    })
                    .catch(error => {
                        console.error('Error calling open-folder API:', error);
                        showToast('Error opening folder', 'error');
                        // Afficher la modale de téléchargement en cas d'erreur
                        showFilesModal(folderPath, title);
                    });
                } else {
                    // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                    console.log(`Showing files list for remote user: ${folderPath}`);
                    showFilesModal(folderPath, title);
                }
            });
        }
        
        const cancelButton = downloadElement.querySelector('.cancel-download-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                cancelDownload(cancelButton.dataset.downloadId);
            });
        }
        
        const retryButton = downloadElement.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                retryDownload(retryButton.dataset.downloadId);
            });
        }
    }, 0);
    
    return downloadElement;
}

function createExtractionElement(item) {
    const extractionElement = document.createElement('div');
    extractionElement.className = 'extraction-item';
    extractionElement.id = `extraction-${item.extraction_id}`;
    
    const statusClass = getStatusClass(item.status);
    const statusText = getStatusText(item.status);
    const title = item.title || getFileNameFromPath(item.audio_path);
    
    extractionElement.innerHTML = `
        <div class="item-header">
            <div class="item-title">${title}</div>
            <div class="item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="item-details">
            <div>Model: ${item.model_name}</div>
            <div>File: ${getFileNameFromPath(item.audio_path)}</div>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="progress-info">
                <span class="progress-percentage">${item.progress}%</span>
            </div>
        </div>
        <div class="item-actions">
            ${item.status === 'completed' ? `
                <div class="action-buttons">
                    <button class="item-button open-mixer-button" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-sliders-h"></i> Mixer les stems
                    </button>
                    <button class="item-button open-folder-button" data-file-path="${Object.values(item.output_paths || {})[0] || ''}">
                        <i class="fas fa-download"></i> Get Tracks
                    </button>
                    ${item.zip_path ? `
                    <button class="item-button download-zip-button" data-file-path="${item.zip_path}">
                        <i class="fas fa-file-archive"></i> Download All (ZIP)
                    </button>
                    ` : ''}
                </div>
            ` : ''}
            ${item.status === 'extracting' || item.status === 'queued' ? `
                <button class="item-button cancel cancel-extraction-button" data-extraction-id="${item.extraction_id}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            ` : ''}
            ${item.status === 'error' ? `
                <div class="error-message">${item.error_message}</div>
                <button class="item-button retry-button" data-extraction-id="${item.extraction_id}">
                    <i class="fas fa-redo"></i> Retry
                </button>
            ` : ''}
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        const openMixerButton = extractionElement.querySelector('.open-mixer-button');
        if (openMixerButton) {
            openMixerButton.addEventListener('click', () => {
                const extractionId = openMixerButton.dataset.extractionId;
                
                // Switch to the Mixer tab
                document.querySelectorAll('.tab-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                // Activate the mixer tab
                const mixerTabButton = document.querySelector('.tab-button[data-tab="mixer"]');
                const mixerTab = document.getElementById('mixerTab');
                mixerTabButton.classList.add('active');
                mixerTab.classList.add('active');
                
                // Show loading indicator and update iframe source
                const loadingDiv = document.getElementById('loading');
                const mixerFrame = document.getElementById('mixerFrame');
                
                loadingDiv.style.display = 'block';
                mixerFrame.style.display = 'none';
                mixerFrame.src = `/mixer?extraction_id=${encodeURIComponent(extractionId)}`;
            });
        }
        
        const openFolderButton = extractionElement.querySelector('.open-folder-button');
        if (openFolderButton) {
            openFolderButton.addEventListener('click', () => {
                const filePath = openFolderButton.dataset.filePath;
                const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'));
                const title = extractionElement.querySelector('.item-title').textContent;
                
                // Déterminer si l'utilisateur est local ou distant
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                if (isLocalhost) {
                    // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                    console.log(`Opening folder locally: ${folderPath}`);
                    
                    fetch('/api/open-folder', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': getCsrfToken()
                        },
                        body: JSON.stringify({ folder_path: folderPath })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log('Folder opened successfully');
                            showToast('Folder opened successfully', 'success');
                        } else {
                            // Si l'ouverture locale échoue, afficher la modale de téléchargement
                            console.error('Error opening folder:', data.message);
                            showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                            showFilesModal(folderPath, title);
                        }
                    })
                    .catch(error => {
                        console.error('Error calling open-folder API:', error);
                        showToast('Error opening folder', 'error');
                        // Afficher la modale de téléchargement en cas d'erreur
                        showFilesModal(folderPath, title);
                    });
                } else {
                    // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                    console.log(`Showing files list for remote user: ${folderPath}`);
                    showFilesModal(folderPath, title);
                }
            });
        }
        
        const downloadZipButton = extractionElement.querySelector('.download-zip-button');
        if (downloadZipButton) {
            downloadZipButton.addEventListener('click', () => {
                const filePath = downloadZipButton.dataset.filePath;
                window.location.href = `/api/download-file?file_path=${encodeURIComponent(filePath)}`;
            });
        }
        
        const cancelButton = extractionElement.querySelector('.cancel-extraction-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                cancelExtraction(cancelButton.dataset.extractionId);
            });
        }
        
        const retryButton = extractionElement.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                retryExtraction(retryButton.dataset.extractionId);
            });
        }
    }, 0);
    
    return extractionElement;
}

// Update Functions
function updateDownloadProgress(data) {
    console.log('Updating download progress:', data);
    
    // Si l'élément n'existe pas, recharger la liste des téléchargements
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) {
        console.warn(`Download element for ID ${data.download_id} not found, refreshing downloads list`);
        return loadDownloads();
    }
    
    try {
        // Récupérer les éléments DOM à mettre à jour
        const progressFill = downloadElement.querySelector('.progress-fill');
        const progressPercentage = downloadElement.querySelector('.progress-percentage');
        const progressDetails = downloadElement.querySelector('.progress-details');
        const statusElement = downloadElement.querySelector('.item-status');
        
        if (!progressFill || !progressPercentage || !progressDetails || !statusElement) {
            console.error('Required elements not found in download item', downloadElement);
            return;
        }
        
        // Formater la progression avec 1 décimale
        const formattedProgress = parseFloat(data.progress).toFixed(1);
        
        console.log(`Updating progress bar to ${formattedProgress}% for download ${data.download_id}`);
        
        // Mettre à jour la barre de progression de manière optimisée
        window.requestAnimationFrame(() => {
            // Update progress bar visually
            progressFill.style.width = `${formattedProgress}%`;
            progressPercentage.textContent = `${formattedProgress}%`;
            
            // Mettre à jour la vitesse et l'ETA
            if (data.speed && data.eta) {
                progressDetails.textContent = `${data.speed} - ${data.eta}`;
            } else if (data.speed) {
                progressDetails.textContent = data.speed;
            } else {
                progressDetails.textContent = 'Downloading...';
            }
            
            // Assurer que le statut est bien "Downloading"
            if (statusElement.textContent !== 'Downloading') {
                statusElement.textContent = 'Downloading';
                statusElement.className = 'item-status status-downloading';
                console.log(`Updated status to Downloading for ${data.download_id}`);
            }
        });
        
        // S'assurer que le bouton d'annulation existe
        const actionsContainer = downloadElement.querySelector('.item-actions');
        if (!actionsContainer.querySelector('.cancel-download-button')) {
            actionsContainer.innerHTML = `
                <button class="item-button cancel cancel-download-button" data-download-id="${data.download_id}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            `;
            
            const cancelButton = actionsContainer.querySelector('.cancel-download-button');
            cancelButton.addEventListener('click', () => {
                cancelDownload(cancelButton.dataset.downloadId);
            });
        }
    } catch (error) {
        console.error('Error updating download progress:', error);
    }
}

function updateDownloadComplete(data) {
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) return;
    
    const progressFill = downloadElement.querySelector('.progress-fill');
    const progressPercentage = downloadElement.querySelector('.progress-percentage');
    const progressDetails = downloadElement.querySelector('.progress-details');
    const statusElement = downloadElement.querySelector('.item-status');
    const actionsContainer = downloadElement.querySelector('.item-actions');
    
    progressFill.style.width = '100%';
    progressPercentage.textContent = '100%';
    progressDetails.textContent = 'Completed';
    
    statusElement.textContent = 'Completed';
    statusElement.className = 'item-status status-completed';
    
    actionsContainer.innerHTML = `
        <button class="item-button extract-button" data-download-id="${data.download_id}" data-title="${data.title}" data-file-path="${data.file_path}">
            <i class="fas fa-music"></i> Extract Stems
        </button>
        <button class="item-button open-folder-button" data-file-path="${data.file_path}">
            <i class="fas fa-download"></i> Get File
        </button>
    `;
    
    // Add event listeners
    const extractButton = actionsContainer.querySelector('.extract-button');
    extractButton.addEventListener('click', () => {
        openExtractionModal(
            extractButton.dataset.downloadId,
            extractButton.dataset.title,
            extractButton.dataset.filePath
        );
    });
    
    const openFolderButton = actionsContainer.querySelector('.open-folder-button');
    openFolderButton.addEventListener('click', () => {
        const filePath = openFolderButton.dataset.filePath;
        const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'));
        const title = downloadElement.querySelector('.item-title').textContent;
        
        // Déterminer si l'utilisateur est local ou distant
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isLocalhost) {
            // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
            console.log(`Opening folder locally: ${folderPath}`);
            
            fetch('/api/open-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify({ folder_path: folderPath })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Folder opened successfully');
                    showToast('Folder opened successfully', 'success');
                } else {
                    // Si l'ouverture locale échoue, afficher la modale de téléchargement
                    console.error('Error opening folder:', data.message);
                    showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                    showFilesModal(folderPath, title);
                }
            })
            .catch(error => {
                console.error('Error calling open-folder API:', error);
                showToast('Error opening folder', 'error');
                // Afficher la modale de téléchargement en cas d'erreur
                showFilesModal(folderPath, title);
            });
        } else {
            // Pour les utilisateurs distants, afficher directement la modale de téléchargement
            console.log(`Showing files list for remote user: ${folderPath}`);
            showFilesModal(folderPath, title);
        }
    });
}

function updateDownloadError(data) {
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) return;
    
    const statusElement = downloadElement.querySelector('.item-status');
    const actionsContainer = downloadElement.querySelector('.item-actions');
    
    statusElement.textContent = 'Error';
    statusElement.className = 'item-status status-error';
    
    actionsContainer.innerHTML = `
        <div class="error-message">${data.error_message}</div>
        <button class="item-button retry-button" data-download-id="${data.download_id}">
            <i class="fas fa-redo"></i> Retry
        </button>
    `;
    
    // Add event listener
    const retryButton = actionsContainer.querySelector('.retry-button');
    retryButton.addEventListener('click', () => {
        retryDownload(retryButton.dataset.downloadId);
    });
}

function updateExtractionProgress(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const progressFill = extractionElement.querySelector('.progress-fill');
    const progressPercentage = extractionElement.querySelector('.progress-percentage');
    const statusElement = extractionElement.querySelector('.item-status');
    
    progressFill.style.width = `${data.progress}%`;
    progressPercentage.textContent = `${data.progress}% - ${data.status_message}`;
    
    if (statusElement.textContent !== 'Extracting') {
        statusElement.textContent = 'Extracting';
        statusElement.className = 'item-status status-extracting';
    }
}

function updateExtractionComplete(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const progressFill = extractionElement.querySelector('.progress-fill');
    const progressPercentage = extractionElement.querySelector('.progress-percentage');
    const statusElement = extractionElement.querySelector('.item-status');
    const actionsContainer = extractionElement.querySelector('.item-actions');
    
    progressFill.style.width = '100%';
    progressPercentage.textContent = '100%';
    
    statusElement.textContent = 'Completed';
    statusElement.className = 'item-status status-completed';
    
    actionsContainer.innerHTML = `
        <div class="action-buttons">
            <button class="item-button open-mixer-button" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-sliders-h"></i> Mixer les stems
            </button>
            <button class="item-button open-folder-button" data-file-path="${Object.values(data.output_paths || {})[0] || ''}">
                <i class="fas fa-download"></i> Get Tracks
            </button>
            ${data.zip_path ? `
            <button class="item-button download-zip-button" data-file-path="${data.zip_path}">
                <i class="fas fa-file-archive"></i> Download All (ZIP)
            </button>
            ` : ''}
        </div>
    `;
    
    // Add event listeners
    const openMixerButton = actionsContainer.querySelector('.open-mixer-button');
    if (openMixerButton) {
        openMixerButton.addEventListener('click', () => {
            const extractionId = openMixerButton.dataset.extractionId;
                
            // Switch to the Mixer tab
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Activate the mixer tab
            const mixerTabButton = document.querySelector('.tab-button[data-tab="mixer"]');
            const mixerTab = document.getElementById('mixerTab');
            mixerTabButton.classList.add('active');
            mixerTab.classList.add('active');
            
            // Show loading indicator and update iframe source
            const loadingDiv = document.getElementById('loading');
            const mixerFrame = document.getElementById('mixerFrame');
            
            loadingDiv.style.display = 'block';
            mixerFrame.style.display = 'none';
            mixerFrame.src = `/mixer?extraction_id=${encodeURIComponent(extractionId)}`;
        });
    }
    
    const openFolderButton = actionsContainer.querySelector('.open-folder-button');
    if (openFolderButton) {
        openFolderButton.addEventListener('click', () => {
            const filePath = openFolderButton.dataset.filePath;
            const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'));
            const title = extractionElement.querySelector('.item-title').textContent;
            
            // Déterminer si l'utilisateur est local ou distant
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                console.log(`Opening folder locally: ${folderPath}`);
                
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: JSON.stringify({ folder_path: folderPath })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('Folder opened successfully');
                        showToast('Folder opened successfully', 'success');
                    } else {
                        // Si l'ouverture locale échoue, afficher la modale de téléchargement
                        console.error('Error opening folder:', data.message);
                        showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                        showFilesModal(folderPath, title);
                    }
                })
                .catch(error => {
                    console.error('Error calling open-folder API:', error);
                    showToast('Error opening folder', 'error');
                    // Afficher la modale de téléchargement en cas d'erreur
                    showFilesModal(folderPath, title);
                });
            } else {
                // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                console.log(`Showing files list for remote user: ${folderPath}`);
                showFilesModal(folderPath, title);
            }
        });
    }
    
    const downloadZipButton = actionsContainer.querySelector('.download-zip-button');
    if (downloadZipButton) {
        downloadZipButton.addEventListener('click', () => {
            const filePath = downloadZipButton.dataset.filePath;
            window.location.href = `/api/download-file?file_path=${encodeURIComponent(filePath)}`;
        });
    }
}

function updateExtractionError(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const statusElement = extractionElement.querySelector('.item-status');
    const actionsContainer = extractionElement.querySelector('.item-actions');
    
    statusElement.textContent = 'Error';
    statusElement.className = 'item-status status-error';
    
    actionsContainer.innerHTML = `
        <div class="error-message">${data.error_message}</div>
        <button class="item-button retry-button" data-extraction-id="${data.extraction_id}">
            <i class="fas fa-redo"></i> Retry
        </button>
    `;
    
    // Add event listener
    const retryButton = actionsContainer.querySelector('.retry-button');
    retryButton.addEventListener('click', () => {
        retryExtraction(retryButton.dataset.extractionId);
    });
}

// Action Functions
function cancelDownload(downloadId) {
    console.log('Cancelling download:', downloadId);
    
    // Afficher un indicateur visuel que l'annulation est en cours
    const downloadElement = document.getElementById(`download-${downloadId}`);
    if (downloadElement) {
        const statusElement = downloadElement.querySelector('.item-status');
        statusElement.textContent = 'Cancelling...';
        statusElement.className = 'item-status status-cancelling';
        
        const progressDetails = downloadElement.querySelector('.progress-details');
        progressDetails.textContent = 'Cancelling download...';
    }
    
    fetch(`/api/downloads/${downloadId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Cancel response:', data);
        if (data.success) {
            showToast('Download cancelled', 'info');
            // Recharger la liste des téléchargements après une courte pause
            setTimeout(() => {
                loadDownloads();
            }, 500);
        } else {
            showToast('Error cancelling download', 'error');
            // Recharger quand même pour mettre à jour l'état
            loadDownloads();
        }
    })
    .catch(error => {
        console.error('Error cancelling download:', error);
        showToast('Error cancelling download', 'error');
        // Recharger quand même pour mettre à jour l'état
        loadDownloads();
    });
}

function retryDownload(downloadId) {
    // Get download details
    fetch(`/api/downloads/${downloadId}`, {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(`Error: ${data.error}`, 'error');
                return;
            }
            
            // Cancel existing download
            cancelDownload(downloadId);
            
            // Create new download
            const downloadItem = {
                video_id: data.video_id,
                title: data.title,
                thumbnail_url: '',
                download_type: data.download_type,
                quality: data.quality
            };
            
            // Add to queue
            fetch('/api/downloads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify(downloadItem)
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showToast(`Error: ${data.error}`, 'error');
                    return;
                }
                
                showToast('Download retried', 'success');
                loadDownloads();
            })
            .catch(error => {
                console.error('Error retrying download:', error);
                showToast('Error retrying download', 'error');
            });
        })
        .catch(error => {
            console.error('Error getting download details:', error);
            showToast('Error getting download details', 'error');
        });
}

function cancelExtraction(extractionId) {
    fetch(`/api/extractions/${extractionId}`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Extraction cancelled', 'info');
            loadExtractions();
        } else {
            showToast('Error cancelling extraction', 'error');
        }
    })
    .catch(error => {
        console.error('Error cancelling extraction:', error);
        showToast('Error cancelling extraction', 'error');
    });
}

function retryExtraction(extractionId) {
    // Get extraction details
    fetch(`/api/extractions/${extractionId}`, {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(`Error: ${data.error}`, 'error');
                return;
            }
            
            // Cancel existing extraction
            cancelExtraction(extractionId);
            
            // Create new extraction
            const extractionItem = {
                audio_path: data.audio_path,
                model_name: data.model_name,
                selected_stems: data.selected_stems || ['vocals', 'drums', 'bass', 'other'],
                two_stem_mode: data.two_stem_mode || false,
                primary_stem: data.primary_stem || 'vocals'
            };
            
            // Add to queue
            fetch('/api/extractions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify(extractionItem)
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showToast(`Error: ${data.error}`, 'error');
                    return;
                }
                
                showToast('Extraction retried', 'success');
                loadExtractions();
            })
            .catch(error => {
                console.error('Error retrying extraction:', error);
                showToast('Error retrying extraction', 'error');
            });
        })
        .catch(error => {
            console.error('Error getting extraction details:', error);
            showToast('Error getting extraction details', 'error');
        });
}

// Settings Functions
function saveSettings() {
    const settings = {
        theme: document.getElementById('themeSelect').value,
        downloads_directory: document.getElementById('downloadsDirectory').value,
        max_concurrent_downloads: parseInt(document.getElementById('maxConcurrentDownloads').value),
        preferred_video_quality: document.getElementById('preferredVideoQuality').value,
        preferred_audio_quality: document.getElementById('preferredAudioQuality').value,
        use_gpu_for_extraction: document.getElementById('useGpuForExtraction').checked,
        default_stem_model: document.getElementById('defaultStemModel').value
    };
    
    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Settings saved', 'success');
            
            // Apply theme
            if (settings.theme === 'light') {
                document.body.classList.add('light-theme');
            } else {
                document.body.classList.remove('light-theme');
            }
            
            // Close modal
            document.getElementById('settingsModal').style.display = 'none';
            
            // Update app config
            appConfig = { ...appConfig, ...settings };
        } else {
            showToast('Error saving settings', 'error');
        }
    })
    .catch(error => {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    });
}

function checkFfmpegStatus() {
    fetch('/api/config/ffmpeg/check', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            const ffmpegStatus = document.getElementById('ffmpegStatus');
            const downloadFfmpegButton = document.getElementById('downloadFfmpegButton');
            
            if (data.ffmpeg_available && data.ffprobe_available) {
                ffmpegStatus.innerHTML = `
                    <p class="status-ok">FFmpeg is available</p>
                    <p>FFmpeg path: ${data.ffmpeg_path}</p>
                    <p>FFprobe path: ${data.ffprobe_path}</p>
                `;
                downloadFfmpegButton.classList.add('hidden');
            } else {
                ffmpegStatus.innerHTML = `
                    <p class="status-error">FFmpeg is not available</p>
                    <p>FFmpeg ${data.ffmpeg_available ? 'is' : 'is not'} available</p>
                    <p>FFprobe ${data.ffprobe_available ? 'is' : 'is not'} available</p>
                `;
                downloadFfmpegButton.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error checking FFmpeg status:', error);
            document.getElementById('ffmpegStatus').innerHTML = '<p class="status-error">Error checking FFmpeg status</p>';
        });
}

function downloadFfmpeg() {
    const ffmpegStatus = document.getElementById('ffmpegStatus');
    const downloadFfmpegButton = document.getElementById('downloadFfmpegButton');
    
    ffmpegStatus.innerHTML = '<p>Downloading FFmpeg...</p>';
    downloadFfmpegButton.disabled = true;
    
    fetch('/api/config/ffmpeg/download', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            ffmpegStatus.innerHTML = `
                <p class="status-ok">FFmpeg downloaded successfully</p>
                <p>${data.message}</p>
            `;
            downloadFfmpegButton.classList.add('hidden');
            showToast('FFmpeg downloaded successfully', 'success');
        } else {
            ffmpegStatus.innerHTML = `
                <p class="status-error">Error downloading FFmpeg</p>
                <p>${data.message}</p>
            `;
            downloadFfmpegButton.disabled = false;
            showToast('Error downloading FFmpeg', 'error');
        }
    })
    .catch(error => {
        console.error('Error downloading FFmpeg:', error);
        ffmpegStatus.innerHTML = '<p class="status-error">Error downloading FFmpeg</p>';
        downloadFfmpegButton.disabled = false;
        showToast('Error downloading FFmpeg', 'error');
    });
}

function updateGpuStatus() {
    const gpuStatus = document.getElementById('gpuStatus');
    
    if (appConfig.using_gpu) {
        gpuStatus.innerHTML = '<p class="status-ok">GPU acceleration is available and enabled</p>';
    } else {
        gpuStatus.innerHTML = '<p class="status-warning">GPU acceleration is not available</p>';
    }
}

// Fonction pour afficher la liste des fichiers dans un dossier
function showFilesModal(folderPath, title) {
    // Créer ou récupérer la fenêtre modale
    let filesModal = document.getElementById('filesModal');
    
    if (!filesModal) {
        // Créer la modale si elle n'existe pas encore
        filesModal = document.createElement('div');
        filesModal.id = 'filesModal';
        filesModal.className = 'modal';
        
        filesModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="filesModalTitle">Files</h2>
                    <span class="close-button">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="filesContainer" class="files-container">
                        <div class="loading">Loading files...</div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(filesModal);
        
        // Gestionnaire d'événement pour fermer la modale
        filesModal.querySelector('.close-button').addEventListener('click', () => {
            filesModal.style.display = 'none';
        });
        
        // Fermer la modale en cliquant à l'extérieur
        filesModal.addEventListener('click', (e) => {
            if (e.target === filesModal) {
                filesModal.style.display = 'none';
            }
        });
    }
    
    // Mettre à jour le titre
    filesModal.querySelector('#filesModalTitle').textContent = title ? `Files - ${title}` : 'Files';
    
    // Afficher la modale
    filesModal.style.display = 'flex';
    
    // Charger la liste des fichiers
    fetch('/api/list-files', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest'  // Ajout pour indiquer une requête AJAX
        },
        body: JSON.stringify({ folder_path: folderPath }),
        credentials: 'same-origin'  // Inclure les cookies pour l'authentification
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        const filesContainer = filesModal.querySelector('#filesContainer');
        
        if (!data.success) {
            filesContainer.innerHTML = `<div class="error-message">${data.message}</div>`;
            return;
        }
        
        if (data.files.length === 0) {
            filesContainer.innerHTML = '<div class="no-items">No files found</div>';
            return;
        }
        
        // Trier les fichiers par nom
        data.files.sort((a, b) => a.name.localeCompare(b.name));
        
        // Créer la liste des fichiers
        let filesHtml = '<ul class="files-list">';
        
        data.files.forEach(file => {
            const fileSize = formatFileSize(file.size);
            const encodedPath = encodeURIComponent(file.path);
            
            filesHtml += `
                <li class="file-item">
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${fileSize}</span>
                    </div>
                    <a href="/api/download-file?file_path=${encodedPath}" 
                       class="item-button download-button" 
                       download="${file.name}">
                        <i class="fas fa-download"></i> Download
                    </a>
                </li>
            `;
        });
        
        filesHtml += '</ul>';
        filesContainer.innerHTML = filesHtml;
    })
    .catch(error => {
        console.error('Error loading files:', error);
        filesModal.querySelector('#filesContainer').innerHTML = 
            `<div class="error-message">Error loading files: ${error.message}</div>`;
    });
}

// Fonction pour formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

// Utility Functions
function getStatusClass(status) {
    switch (status) {
        case 'queued':
            return 'status-queued';
        case 'downloading':
        case 'extracting':
            return 'status-downloading';
        case 'completed':
            return 'status-completed';
        case 'error':
            return 'status-error';
        default:
            return '';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'queued':
            return 'Queued';
        case 'downloading':
            return 'Downloading';
        case 'extracting':
            return 'Extracting';
        case 'completed':
            return 'Completed';
        case 'error':
            return 'Error';
        default:
            return status;
    }
}

function getFileNameFromPath(path) {
    if (!path) return '';
    return path.split('\\').pop().split('/').pop();
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Helper function to extract video ID from YouTube URL
function extractVideoId(url) {
    // Check if it's already a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    // Try to extract from URL
    const regExp = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    
    return (match && match[2].length === 11) ? match[2] : null;
}

// Display search results
function displaySearchResults(data) {
    console.log('Received search results data:', data);
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '';
    
    // Check if we have valid data
    if (!data || (Array.isArray(data) && data.length === 0) || 
        (data.items && data.items.length === 0)) {
        console.log('No results found in data');
        resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }
    
    // Normalize data format
    let items = [];
    if (Array.isArray(data)) {
        console.log('Data is an array');
        items = data;
    } else if (data.items && Array.isArray(data.items)) {
        console.log('Data has items array');
        items = data.items;
    } else {
        console.error('Unexpected data format:', data);
        resultsContainer.innerHTML = '<div class="error-message">Error processing search results</div>';
        return;
    }
    
    console.log('Processing', items.length, 'items');
    
    // Create result elements
    items.forEach((item, index) => {
        console.log(`Processing item ${index}:`, item);
        
        // Extract video ID
        let videoId;
        if (item.id && typeof item.id === 'object' && item.id.videoId) {
            videoId = item.id.videoId;
        } else if (item.id && typeof item.id === 'string') {
            videoId = item.id;
        } else {
            videoId = item.videoId || '';
        }
        
        console.log(`Extracted videoId: ${videoId}`);
        
        // Extract other information
        const title = item.snippet?.title || item.title || 'Unknown Title';
        const channelTitle = item.snippet?.channelTitle || item.channel?.name || 'Unknown Channel';
        const thumbnailUrl = getThumbnailUrl(item);
        const duration = formatDuration(item.contentDetails?.duration || item.duration);
        
        console.log(`Title: ${title}, Channel: ${channelTitle}, Thumbnail: ${thumbnailUrl}`);
        
        // Create result element
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result';
        resultElement.innerHTML = `
            <img class="result-thumbnail" src="${thumbnailUrl}" alt="${title}">
            <div class="result-info">
                <div class="result-title">${title}</div>
                <div class="result-channel">${channelTitle}</div>
                <div class="result-duration">${duration}</div>
                <div class="result-actions">
                    <button class="result-button play-button" data-video-id="${videoId}">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="result-button download-button" data-video-id="${videoId}" data-title="${title}" data-thumbnail="${thumbnailUrl}">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            </div>
        `;
        
        resultsContainer.appendChild(resultElement);
    });
    
    console.log('Added event listeners to buttons');
    
    // Add event listeners to buttons
    document.querySelectorAll('.play-button').forEach(button => {
        button.addEventListener('click', () => {
            const videoId = button.dataset.videoId;
            window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
        });
    });
    
    document.querySelectorAll('.download-button').forEach(button => {
        button.addEventListener('click', () => {
            const videoId = button.dataset.videoId;
            openDownloadModal(videoId, button.dataset.title, button.dataset.thumbnail);
        });
    });
}

// Helper function to get the best thumbnail URL
function getThumbnailUrl(item) {
    // Handle different API response structures
    if (item.snippet && item.snippet.thumbnails) {
        const thumbnails = item.snippet.thumbnails;
        return thumbnails.medium?.url || thumbnails.default?.url || '';
    } else if (item.thumbnails && Array.isArray(item.thumbnails)) {
        // Find a thumbnail with width between 200 and 400px
        const mediumThumbnail = item.thumbnails.find(thumb => 
            thumb.width >= 200 && thumb.width <= 400
        );
        
        if (mediumThumbnail) {
            return mediumThumbnail.url;
        }
        
        // Fallback to the first thumbnail
        return item.thumbnails[0]?.url || '';
    } else if (item.thumbnail) {
        return item.thumbnail;
    }
    
    return '';
}
