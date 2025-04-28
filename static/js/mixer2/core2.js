// core2.js - Module principal pour Mixer2 (WaveSurfer.js multipiste)
// Inspiré de StemMixer (core.js), mais basé sur WaveSurfer.js et ses plugins

class Mixer2 {
    constructor() {
        this.isInitialized = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.stems = {};
        this.availableStems = [];
        this.multitrack = null;
        this.timeline = null;
        this.regions = null;
        this.minimap = null;
        this.elements = {
            app: document.querySelector('.mixer2-app'),
            tracks: document.getElementById('m2-tracks'),
            timeline: document.getElementById('m2-timeline'),
            playBtn: document.getElementById('m2-play'),
            stopBtn: document.getElementById('m2-stop'),
            zoomInBtn: document.getElementById('m2-zoom-in'),
            zoomOutBtn: document.getElementById('m2-zoom-out'),
            zoomResetBtn: document.getElementById('m2-zoom-reset'),
            autoscrollBtn: document.getElementById('m2-autoscroll'),
            autocenterBtn: document.getElementById('m2-autocenter'),
            timeDisplay: document.getElementById('m2-time'),
            errorDiv: document.getElementById('plugin-error')
        };
        this.init();
    }

    async init() {
        this.log('Initialisation du mixeur 2...');
        // Vérification extraction_id
        if (!window.EXTRACTION_ID || window.EXTRACTION_ID === 'None' || window.EXTRACTION_ID.trim() === '') {
            this.showError("Erreur : aucun ID d'extraction fourni. Veuillez d'abord extraire des stems.");
            return;
        }
        // Charger les stems disponibles
        await this.loadStems();
        if (this.availableStems.length === 0) {
            this.showError("Erreur : aucun stem audio valide trouvé.");
            return;
        }
        // Générer l'UI des pistes
        this.generateTracksUI();
        // Initialiser Multitrack
        if (typeof window.Multitrack === 'undefined' && typeof window.WaveSurferMultitrack === 'undefined') {
            this.showError("Erreur : le plugin Multitrack n'est pas chargé. Vérifiez le chargement de multitrack.min.js.");
            return;
        }
        const Multitrack = window.Multitrack || window.WaveSurferMultitrack;
        try {
            this.multitrack = new Multitrack({
                container: '#m2-tracks',
                tracks: this.availableStems.map(stem => ({
                    src: stem.url,
                    id: stem.name,
                    label: stem.name,
                    waveColor: '#4CAF50',
                    progressColor: '#2196F3',
                    container: `#ws-${stem.name}`
                })),
                minPxPerSec: 100,
                height: 80,
                isMaster: true,
                controls: false
            });
        } catch (e) {
            this.showError("Erreur lors de l'initialisation du mixeur multipiste : " + e.message);
            return;
        }
        // Initialiser plugins additionnels
        if (window.WaveSurferTimeline && this.elements.timeline) {
            try {
                this.timeline = window.WaveSurferTimeline.create({
                    container: '#m2-timeline',
                    height: 30
                });
            } catch (e) { this.log('Timeline plugin error: ' + e); }
        }
        if (window.WaveSurferRegions) {
            try {
                this.regions = window.WaveSurferRegions.create();
            } catch (e) { this.log('Regions plugin error: ' + e); }
        }
        if (window.WaveSurferMinimap) {
            try {
                this.minimap = window.WaveSurferMinimap.create();
            } catch (e) { this.log('Minimap plugin error: ' + e); }
        }
        // Lier les contrôles globaux
        this.setupEventListeners();
        this.isInitialized = true;
        this.log('Mixer2 initialisé avec succès !');
    }

    async loadStems() {
        const STEMS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
        const extractionId = window.EXTRACTION_ID;
        const encodedId = encodeURIComponent(extractionId);
        this.availableStems = [];
        for (const name of STEMS) {
            try {
                const resp = await fetch(`/api/extracted_stems/${encodedId}/${name}.mp3`, { method: 'HEAD' });
                if (resp.ok) {
                    this.availableStems.push({ name, url: `/api/extracted_stems/${encodedId}/${name}.mp3` });
                }
            } catch (e) {}
        }
    }

    generateTracksUI() {
        this.elements.tracks.innerHTML = '';
        for (const stem of this.availableStems) {
            const trackDiv = document.createElement('div');
            trackDiv.className = 'mixer2-track';
            // Contrôles de piste
            const controls = document.createElement('div');
            controls.className = 'mixer2-track-controls';
            controls.innerHTML = `
                <span class="mixer2-track-label">${stem.name}</span>
                <button class="m2-mute" title="Mute"><i class="fas fa-volume-mute"></i></button>
                <button class="m2-solo" title="Solo"><i class="fas fa-headphones"></i></button>
                <input type="range" class="mixer2-fader" min="0" max="1" step="0.01" value="1" title="Volume">
                <input type="range" class="mixer2-panner" min="-1" max="1" step="0.01" value="0" title="Pan">
            `;
            // Conteneur WaveSurfer
            const wsDiv = document.createElement('div');
            wsDiv.className = 'mixer2-wavesurfer';
            wsDiv.id = `ws-${stem.name}`;
            trackDiv.appendChild(controls);
            trackDiv.appendChild(wsDiv);
            this.elements.tracks.appendChild(trackDiv);
        }
    }

    setupEventListeners() {
        // Play/Pause
        this.elements.playBtn.addEventListener('click', () => {
            if (this.multitrack.isPlaying()) {
                this.multitrack.pause();
                this.elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
            } else {
                this.multitrack.play();
                this.elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
        });
        // Stop
        this.elements.stopBtn.addEventListener('click', () => {
            this.multitrack.stop();
            this.elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        });
        // Zoom In
        this.elements.zoomInBtn.addEventListener('click', () => {
            const current = this.multitrack.options.minPxPerSec || 100;
            this.multitrack.setOptions({ minPxPerSec: current * 1.2 });
        });
        // Zoom Out
        this.elements.zoomOutBtn.addEventListener('click', () => {
            const current = this.multitrack.options.minPxPerSec || 100;
            this.multitrack.setOptions({ minPxPerSec: Math.max(20, current / 1.2) });
        });
        // Zoom Reset
        this.elements.zoomResetBtn.addEventListener('click', () => {
            this.multitrack.setOptions({ minPxPerSec: 100 });
        });
        // Autoscroll (active/désactive le scroll automatique du playhead)
        let autoscrollActive = false;
        this.elements.autoscrollBtn.addEventListener('click', () => {
            autoscrollActive = !autoscrollActive;
            this.elements.autoscrollBtn.classList.toggle('active', autoscrollActive);
        });
        // Autoscroll automatique lors de la lecture
        this.multitrack.on('timeupdate', (currentTime) => {
            const mins = Math.floor(currentTime / 60);
            const secs = Math.floor(currentTime % 60);
            this.elements.timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            // Autoscroll automatique si activé
            if (autoscrollActive) {
                const px = this.multitrack.getCurrentTime() * (this.multitrack.options.minPxPerSec || 100);
                this.multitrack.getWrapper().scrollLeft = Math.max(0, px - this.multitrack.getWrapper().clientWidth / 2);
            }
        });
        // Autocenter (centre le playhead dans la vue)
        this.elements.autocenterBtn.addEventListener('click', () => {
            const px = this.multitrack.getCurrentTime() * (this.multitrack.options.minPxPerSec || 100);
            this.multitrack.getWrapper().scrollLeft = Math.max(0, px - this.multitrack.getWrapper().clientWidth / 2);
        });
        // Sélection et boucle sur une région commune
        if (this.regions) {
            let loopRegion = null;
            // Permettre la création d'une région par sélection souris sur la timeline
            this.elements.timeline.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const timelineRect = this.elements.timeline.getBoundingClientRect();
                const startX = e.clientX - timelineRect.left;
                const duration = this.multitrack.getDuration();
                const pxPerSec = (timelineRect.width) / duration;
                let regionStart = startX / pxPerSec;
                let regionEnd = regionStart;
                const onMouseMove = (ev) => {
                    const currentX = ev.clientX - timelineRect.left;
                    regionEnd = Math.max(0, Math.min(duration, currentX / pxPerSec));
                    if (loopRegion) this.regions.removeRegion(loopRegion.id);
                    loopRegion = this.regions.addRegion({
                        start: Math.min(regionStart, regionEnd),
                        end: Math.max(regionStart, regionEnd),
                        color: 'rgba(33,150,243,0.2)',
                        drag: true,
                        resize: true,
                        loop: true
                    });
                };
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (loopRegion && loopRegion.end - loopRegion.start > 0.2) {
                        // Activer la boucle sur la région
                        this.multitrack.setLoop(loopRegion.start, loopRegion.end);
                    } else if (loopRegion) {
                        this.regions.removeRegion(loopRegion.id);
                        loopRegion = null;
                        this.multitrack.setLoop(null, null);
                    }
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            // Désactiver la boucle si la région est supprimée
            this.regions.on('region-removed', (region) => {
                if (loopRegion && region.id === loopRegion.id) {
                    this.multitrack.setLoop(null, null);
                    loopRegion = null;
                }
            });
        }
        // TODO : Lier les contrôles de piste (mute, solo, volume, pan) à l'API Multitrack
    }

    showError(message) {
        if (this.elements.errorDiv) {
            this.elements.errorDiv.textContent = message;
        } else {
            alert(message);
        }
    }

    log(message) {
        console.log(`[Mixer2] ${new Date().toISOString().slice(11, 19)} - ${message}`);
    }
}

// Initialisation automatique
window.addEventListener('DOMContentLoaded', () => {
    window.mixer2 = new Mixer2();
});
