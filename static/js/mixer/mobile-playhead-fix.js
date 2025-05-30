/**
 * Correction du playhead mobile - Ajouter les méthodes manquantes au MobileAudioEngine
 */

if (typeof MobileAudioEngine !== 'undefined') {
    
    // Ajouter la méthode startTimeUpdate manquante
    MobileAudioEngine.prototype.startTimeUpdate = function() {
        console.log('[MobilePlayhead] Démarrage mise à jour temps');
        
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        
        this.timeUpdateInterval = setInterval(() => {
            if (!this.isPausing && Object.keys(this.audioElements).length > 0) {
                // Obtenir le temps de lecture à partir du premier stem
                const firstStem = Object.values(this.audioElements)[0];
                if (firstStem && firstStem.audio && !firstStem.audio.paused) {
                    const currentTime = firstStem.audio.currentTime || 0;
                    
                    // Mettre à jour le temps du mixer
                    this.mixer.currentTime = currentTime;
                    
                    // Mettre à jour l'affichage du temps
                    if (this.mixer.elements && this.mixer.elements.timeDisplay) {
                        const minutes = Math.floor(currentTime / 60);
                        const seconds = Math.floor(currentTime % 60);
                        this.mixer.elements.timeDisplay.textContent = 
                            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                    
                    // Mettre à jour le playhead de la timeline
                    if (this.mixer.timeline && this.mixer.timeline.updatePlayhead) {
                        this.mixer.timeline.updatePlayhead();
                    }
                    
                    // Mettre à jour les playheads des waveforms
                    this.updateWaveformPlayheads(currentTime);
                }
            }
        }, 50); // 20 FPS pour un mouvement fluide
    };
    
    // Ajouter la méthode stopTimeUpdate manquante
    MobileAudioEngine.prototype.stopTimeUpdate = function() {
        console.log('[MobilePlayhead] Arrêt mise à jour temps');
        
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    };
    
    // Ajouter la méthode updateWaveformPlayheads
    MobileAudioEngine.prototype.updateWaveformPlayheads = function(currentTime) {
        if (!this.mixer.stems || !this.mixer.maxDuration || this.mixer.maxDuration <= 0) {
            return;
        }
        
        const progress = currentTime / this.mixer.maxDuration;
        const leftPercent = Math.min(100, Math.max(0, progress * 100));
        
        // Mettre à jour chaque playhead de waveform
        Object.keys(this.mixer.stems).forEach(name => {
            const track = document.querySelector(`.track[data-stem="${name}"]`);
            if (track) {
                let playhead = track.querySelector('.track-playhead');
                
                // Créer le playhead s'il n'existe pas
                if (!playhead) {
                    const waveformContainer = track.querySelector('.waveform-container, .waveform');
                    if (waveformContainer) {
                        playhead = document.createElement('div');
                        playhead.className = 'track-playhead';
                        playhead.style.cssText = `
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 2px;
                            height: 100%;
                            background: #007AFF;
                            opacity: 0.8;
                            z-index: 2;
                            pointer-events: none;
                            transition: none;
                        `;
                        waveformContainer.appendChild(playhead);
                    }
                }
                
                if (playhead) {
                    playhead.style.left = `${leftPercent}%`;
                }
            }
        });
    };
    
    // S'assurer que pause appelle bien stopTimeUpdate
    const originalPause = MobileAudioEngine.prototype.pause;
    MobileAudioEngine.prototype.pause = function() {
        const result = originalPause.call(this);
        this.stopTimeUpdate();
        return result;
    };
    
    console.log('[MobilePlayhead] Méthodes playhead ajoutées au MobileAudioEngine');
}
