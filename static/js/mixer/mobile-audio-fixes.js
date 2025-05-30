/**
 * Améliorations pour l'audio mobile - iOS unlock et Android playhead
 */

// Extension du MobileAudioEngine pour iOS unlock
if (typeof MobileAudioEngine !== 'undefined') {
    // Ajouter l'unlock iOS au prototype
    MobileAudioEngine.prototype.initIOSAudioUnlock = function() {
        if (!this.isIOS) return;
        
        this.mixer.log('Initialisation iOS audio unlock');
        
        // Créer un handler d'unlock unifié
        const unlockHandler = async (event) => {
            if (this.audioUnlocked || this.unlockInProgress) return;
            
            this.unlockInProgress = true;
            this.mixer.log('Tentative d\'unlock audio iOS...');
            
            try {
                // Créer un audio test court pour l'unlock
                const testAudio = new Audio();
                testAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==';
                testAudio.load();
                
                // Tenter de jouer l'audio test
                await testAudio.play();
                testAudio.pause();
                testAudio.remove();
                
                this.audioUnlocked = true;
                this.unlockInProgress = false;
                
                // Supprimer les listeners d'unlock
                document.removeEventListener('touchstart', unlockHandler);
                document.removeEventListener('touchend', unlockHandler);
                document.removeEventListener('click', unlockHandler);
                
                this.mixer.log('Audio iOS déverrouillé avec succès');
                
                // Masquer le toast d'unlock s'il existe
                const toast = document.querySelector('.ios-unlock-toast');
                if (toast) {
                    toast.style.display = 'none';
                }
                
                return true;
            } catch (error) {
                this.unlockInProgress = false;
                this.mixer.log(`Échec unlock iOS: ${error.message}`);
                return false;
            }
        };
        
        // Ajouter les event listeners
        document.addEventListener('touchstart', unlockHandler, { passive: true });
        document.addEventListener('touchend', unlockHandler, { passive: true });
        document.addEventListener('click', unlockHandler, { passive: true });
        
        // Afficher un toast pour informer l'utilisateur
        this.showIOSUnlockToast();
    };
    
    // Afficher le toast d'instruction iOS
    MobileAudioEngine.prototype.showIOSUnlockToast = function() {
        // Éviter de créer plusieurs toasts
        if (document.querySelector('.ios-unlock-toast')) return;
        
        const toast = document.createElement('div');
        toast.className = 'ios-unlock-toast';
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">🔊</div>
                <div class="toast-text">
                    <strong>Activation Audio iOS</strong>
                    <br>Touchez l'écran pour activer l'audio
                </div>
                <button class="toast-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
            </div>
        `;
        
        // Styles inline pour le toast
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #007AFF;
            color: white;
            padding: 0;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 90vw;
            animation: slideDown 0.3s ease;
        `;
        
        // Style pour le contenu
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            .toast-content {
                display: flex;
                align-items: center;
                padding: 15px 20px;
                gap: 12px;
            }
            .toast-icon {
                font-size: 24px;
            }
            .toast-text {
                flex: 1;
                font-size: 14px;
                line-height: 1.3;
            }
            .toast-close {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                width: 30px;
                height: 30px;
                border-radius: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0.8;
            }
            .toast-close:hover {
                background: rgba(255,255,255,0.2);
                opacity: 1;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(toast);
        
        // Auto-masquer après 10 secondes
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.display = 'none';
            }
        }, 10000);
    };
    
    // Override de la méthode play pour iOS
    const originalPlay = MobileAudioEngine.prototype.play;
    MobileAudioEngine.prototype.play = function() {
        // Sur iOS, vérifier que l'audio est déverrouillé
        if (this.isIOS && !this.audioUnlocked) {
            this.mixer.log('Audio iOS non déverrouillé - affichage du toast');
            this.showIOSUnlockToast();
            return false;
        }
        
        return originalPlay.call(this);
    };
    
    // Améliorer la mise à jour du temps pour Android et iOS
    MobileAudioEngine.prototype.startTimeUpdate = function() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        
        this.timeUpdateInterval = setInterval(() => {
            if (!this.isPausing && Object.keys(this.audioElements).length > 0) {
                // Obtenir le temps de lecture à partir du premier stem
                const firstStem = Object.values(this.audioElements)[0];
                if (firstStem && firstStem.audio) {
                    const currentTime = firstStem.audio.currentTime || 0;
                    
                    // Mettre à jour le temps du mixer
                    this.mixer.currentTime = currentTime;
                    
                    // Mettre à jour l'affichage du temps
                    if (this.mixer.elements.timeDisplay) {
                        const minutes = Math.floor(currentTime / 60);
                        const seconds = Math.floor(currentTime % 60);
                        this.mixer.elements.timeDisplay.textContent = 
                            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                    
                    // Mettre à jour le playhead
                    if (this.mixer.timeline) {
                        this.mixer.timeline.updatePlayhead();
                    }
                    
                    // Mettre à jour les playheads des waveforms
                    this.updateWaveformPlayheads(currentTime);
                }
            }
        }, 50); // 20 FPS pour un mouvement fluide
    };
    
    // Nouvelle méthode pour mettre à jour les playheads des waveforms
    MobileAudioEngine.prototype.updateWaveformPlayheads = function(currentTime) {
        Object.keys(this.mixer.stems).forEach(name => {
            const track = document.querySelector(`.track[data-stem="${name}"]`);
            if (track) {
                const waveformContainer = track.querySelector('.waveform-container, .waveform');
                const playhead = track.querySelector('.track-playhead');
                
                if (waveformContainer && playhead && this.mixer.maxDuration > 0) {
                    const progress = currentTime / this.mixer.maxDuration;
                    const leftPercent = Math.min(100, Math.max(0, progress * 100));
                    playhead.style.left = `${leftPercent}%`;
                }
            }
        });
    };
    
    // Arrêter la mise à jour du temps
    MobileAudioEngine.prototype.stopTimeUpdate = function() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    };
    
    // Améliorer la méthode updateStemAudio pour être plus réactive
    const originalUpdateStemAudio = MobileAudioEngine.prototype.updateStemAudio;
    MobileAudioEngine.prototype.updateStemAudio = function(name) {
        const result = originalUpdateStemAudio.call(this, name);
        
        // Déclencher une mise à jour visuelle des contrôles
        const track = document.querySelector(`.track[data-stem="${name}"]`);
        if (track) {
            const stem = this.audioElements[name];
            if (stem) {
                // Mettre à jour les boutons visuellement
                const muteBtn = track.querySelector('[data-action="toggle-mute"]');
                const soloBtn = track.querySelector('[data-action="toggle-solo"]');
                
                if (muteBtn) {
                    muteBtn.classList.toggle('active', stem.muted);
                }
                if (soloBtn) {
                    soloBtn.classList.toggle('active', stem.solo);
                }
                
                // Mettre à jour le slider de volume
                const volumeSlider = track.querySelector('input[type="range"]');
                if (volumeSlider && volumeSlider.dataset.control === 'volume') {
                    volumeSlider.value = stem.volume;
                }
            }
        }
        
        return result;
    };
}

// Initialisation automatique au chargement
document.addEventListener('DOMContentLoaded', function() {
    console.log('[MobileAudioFixes] Améliorations mobiles chargées');
});
