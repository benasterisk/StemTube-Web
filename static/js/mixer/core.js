/**
 * StemTubes Mixer - Core Module
 * Module principal pour l'initialisation et la coordination du mixeur
 */

class StemMixer {
    /**
     * Constructeur du mixeur
     */
    constructor() {
        // Propriétés générales
        this.isInitialized = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.maxDuration = 0;
        this.stems = {};
        this.zoomLevels = {
            horizontal: 1.0,
            vertical: 1.0
        };
        
        // Éléments DOM du mixer
        this.elements = {
            app: document.getElementById('mixer-app'),
            loading: document.getElementById('loading-container'),
            tracks: document.getElementById('tracks-container'),
            playBtn: document.getElementById('play-btn'),
            stopBtn: document.getElementById('stop-btn'),
            timeDisplay: document.getElementById('time-display'),
            timeline: document.getElementById('timeline'),
            playhead: document.getElementById('timeline-playhead'),
            zoomInH: document.getElementById('zoom-in-h'),
            zoomOutH: document.getElementById('zoom-out-h'),
            zoomInV: document.getElementById('zoom-in-v'),
            zoomOutV: document.getElementById('zoom-out-v'),
            zoomReset: document.getElementById('zoom-reset')
        };
        
        // Initialiser les modules
        this.initModules();
        
        // Démarrer le chargement
        this.init();
    }
    
    /**
     * Initialiser les modules du mixeur
     */
    initModules() {
        // Initialiser le moteur audio
        this.audioEngine = new AudioEngine(this);
        
        // Initialiser le gestionnaire de timeline
        this.timeline = new Timeline(this);
        
        // Initialiser le gestionnaire de forme d'onde
        this.waveform = new WaveformRenderer(this);
        
        // Initialiser le gestionnaire de contrôles de piste
        this.trackControls = new TrackControls(this);
        
        // Logger l'initialisation des modules
        console.log('[StemMixer] Modules initialisés');
    }
    
    /**
     * Logger avec horodatage
     */
    log(message) {
        console.log(`[StemMixer] ${new Date().toISOString().slice(11, 19)} - ${message}`);
    }
    
    /**
     * Initialiser le mixeur
     */
    async init() {
        this.log('Initialisation du mixeur...');
        
        try {
            // Utiliser l'ID d'extraction globale définie dans le template
            if (!EXTRACTION_ID) {
                throw new Error('ID d\'extraction non spécifié dans l\'URL');
            }
            
            // Définir la variable globale pour l'ID d'extraction
            this.extractionId = EXTRACTION_ID;
            this.encodedExtractionId = ENCODED_EXTRACTION_ID;
            
            // Initialiser le contexte audio
            await this.audioEngine.initAudioContext();
            
            // Configurer les écouteurs d'événements pour les contrôles
            this.setupEventListeners();
            
            // Récupérer et charger les stems
            await this.loadStems();
            
            // Créer la timeline
            this.timeline.createTimeMarkers();
            
            // Masquer le message de chargement et afficher le mixeur
            if (this.elements.loading) {
                this.elements.loading.style.display = 'none';
            }
            if (this.elements.app) {
                this.elements.app.style.display = 'flex';
            }
            
            // Attendre que les éléments DOM soient complètement rendus
            // puis redessiner les formes d'onde et configurer la synchronisation du défilement
            setTimeout(() => {
                this.waveform.resizeAllWaveforms();
                this.waveform.updateAllWaveforms();
                this.setupScrollSynchronization();
                this.log('Rendu des formes d\'onde effectué après initialisation complète');
            }, 300);
            
            this.isInitialized = true;
            this.log('Mixer initialisé avec succès !');
        } catch (error) {
            this.log(`Erreur lors de l'initialisation: ${error.message}`);
            this.showError(`Erreur: ${error.message}`);
        }
    }
    
    /**
     * Configurer les écouteurs d'événements
     */
    setupEventListeners() {
        // Synchroniser le défilement horizontal entre les conteneurs de forme d'onde
        this.setupScrollSynchronization();
        
        // Bouton de lecture/pause
        if (this.elements.playBtn) {
            this.elements.playBtn.addEventListener('click', () => {
                this.togglePlayback();
            });
        }
        
        // Bouton d'arrêt
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => {
                this.stop();
            });
        }
        
        // Timeline pour le déplacement de la tête de lecture
        if (this.elements.timeline) {
            // Gestionnaire pour les clics simples
            this.elements.timeline.addEventListener('click', (e) => {
                // Ne pas traiter comme un clic simple si on était en mode glissement
                if (!this.timeline.isDragging) {
                    this.timeline.handleTimelineClick(e);
                }
            });
            
            // Gestionnaire pour le début d'un glissement (scratching)
            this.elements.timeline.addEventListener('mousedown', (e) => {
                this.timeline.handleMouseDown(e);
            });
        }
        
        // Contrôles de zoom
        if (this.elements.zoomInH) {
            this.elements.zoomInH.addEventListener('click', () => {
                this.zoomLevels.horizontal = Math.min(10, this.zoomLevels.horizontal * 1.2);
                this.waveform.updateAllWaveforms();
            });
        }
        
        if (this.elements.zoomOutH) {
            this.elements.zoomOutH.addEventListener('click', () => {
                this.zoomLevels.horizontal = Math.max(0.5, this.zoomLevels.horizontal / 1.2);
                this.waveform.updateAllWaveforms();
            });
        }
        
        if (this.elements.zoomInV) {
            this.elements.zoomInV.addEventListener('click', () => {
                this.zoomLevels.vertical = Math.min(10, this.zoomLevels.vertical * 1.2);
                this.waveform.updateAllWaveforms();
            });
        }
        
        if (this.elements.zoomOutV) {
            this.elements.zoomOutV.addEventListener('click', () => {
                this.zoomLevels.vertical = Math.max(0.5, this.zoomLevels.vertical / 1.2);
                this.waveform.updateAllWaveforms();
            });
        }
        
        if (this.elements.zoomReset) {
            this.elements.zoomReset.addEventListener('click', () => {
                this.zoomLevels.horizontal = 1.0;
                this.zoomLevels.vertical = 1.0;
                this.waveform.updateAllWaveforms();
            });
        }
        
        // Écouter les touches du clavier
        document.addEventListener('keydown', (e) => {
            // Espace pour lecture/pause
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlayback();
            }
            // Échap pour arrêter
            else if (e.code === 'Escape') {
                this.stop();
            }
        });
        
        this.log('Écouteurs d\'événements configurés');
    }
    
    /**
     * Configurer la synchronisation du défilement horizontal pour toutes les formes d'onde
     */
    setupScrollSynchronization() {
        // Sélectionner tous les conteneurs de forme d'onde
        const waveformContainers = document.querySelectorAll('.waveform-container');
        
        // Ajouter des écouteurs d'événements de défilement à chaque conteneur
        waveformContainers.forEach(container => {
            container.addEventListener('scroll', (e) => {
                const scrollLeft = e.target.scrollLeft;
                
                // Synchroniser tous les autres conteneurs de forme d'onde
                waveformContainers.forEach(otherContainer => {
                    if (otherContainer !== e.target) {
                        otherContainer.scrollLeft = scrollLeft;
                    }
                });
            });
        });
        
        this.log('Synchronisation du défilement horizontal configurée');
    }
    
    /**
     * Charger les stems depuis le serveur
     */
    async loadStems() {
        try {
            // Les noms des stems standard que nous allons essayer de charger
            const standardStems = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
            this.log('Chargement des stems standards...');
            
            // Créer les URL pour chaque stem
            const stemFiles = standardStems.map(stem => ({
                name: stem,
                url: `/api/extracted_stems/${this.encodedExtractionId}/${stem}.mp3`
            }));
            
            // Charger tous les stems en parallèle
            const loadPromises = stemFiles.map(stem => this.audioEngine.loadStem(stem.name, stem.url));
            await Promise.all(loadPromises);
            
            // Mettre à jour la durée maximale
            this.updateMaxDuration();
            
            // Rendre les formes d'onde immédiatement après le chargement des stems
            this.waveform.updateAllWaveforms();
            
            this.log('Tous les stems ont été chargés avec succès');
        } catch (error) {
            this.log(`Erreur lors du chargement des stems: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Mettre à jour la durée maximale des stems
     */
    updateMaxDuration() {
        let maxDuration = 0;
        
        // Trouver la durée maximale parmi tous les stems
        Object.values(this.stems).forEach(stem => {
            if (stem.buffer && stem.buffer.duration > maxDuration) {
                maxDuration = stem.buffer.duration;
            }
        });
        
        this.maxDuration = maxDuration;
        this.log(`Durée maximale mise à jour : ${maxDuration.toFixed(2)} secondes`);
        
        return maxDuration;
    }
    
    /**
     * Basculer entre lecture et pause
     */
    togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    /**
     * Démarrer la lecture
     */
    play() {
        if (!this.isInitialized || Object.keys(this.stems).length === 0) {
            this.log('Impossible de démarrer la lecture: mixeur non initialisé ou aucun stem disponible');
            return;
        }
        
        this.log('Démarrage de la lecture');
        this.audioEngine.play();
        this.updatePlayPauseButton();
    }
    
    /**
     * Mettre en pause la lecture
     */
    pause() {
        this.log('Mise en pause de la lecture');
        this.audioEngine.pause();
        this.updatePlayPauseButton();
    }
    
    /**
     * Arrêter la lecture
     */
    stop() {
        this.log('Arrêt de la lecture');
        this.audioEngine.stop();
        this.updatePlayPauseButton();
    }
    
    /**
     * Mettre à jour l'apparence du bouton lecture/pause
     */
    updatePlayPauseButton() {
        if (!this.elements.playBtn) return;
        
        if (this.isPlaying) {
            this.elements.playBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            this.elements.playBtn.classList.add('playing');
        } else {
            this.elements.playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
            this.elements.playBtn.classList.remove('playing');
        }
    }
    
    /**
     * Afficher un message d'erreur
     */
    showError(message) {
        if (this.elements.loading) {
            this.elements.loading.innerHTML = `<div class="error-message">${message}</div>`;
        } else {
            alert(message);
        }
    }
    
    /**
     * Formatter le temps (secondes -> MM:SS)
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Mettre à jour l'affichage du temps
     */
    updateTimeDisplay() {
        if (this.elements.timeDisplay) {
            this.elements.timeDisplay.textContent = this.formatTime(this.currentTime);
        }
    }
}

// Démarrer le mixeur lorsque la page est chargée
document.addEventListener('DOMContentLoaded', () => {
    window.stemMixer = new StemMixer();
});
