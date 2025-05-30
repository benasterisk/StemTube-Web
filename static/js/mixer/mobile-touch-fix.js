/**
 * Améliorations pour les contrôles tactiles mobiles
 * Corrige les problèmes Android de contrôles inactifs
 */

// Amélioration des contrôles tactiles pour TrackControls
if (typeof TrackControls !== 'undefined') {
    
    // Override de la méthode addMobileTouchHandlers
    TrackControls.prototype.addMobileTouchHandlers = function(trackElement, name) {
        console.log(`[MobileTouchFix] Ajout des handlers tactiles pour ${name}`);
        
        // Améliorer tous les boutons avec des événements tactiles
        const buttons = trackElement.querySelectorAll('button, .control-button');
        buttons.forEach(button => {
            // Supprimer les anciens listeners s'ils existent
            button.removeEventListener('click', button._mobileClickHandler);
            button.removeEventListener('touchstart', button._mobileTouchStartHandler);
            button.removeEventListener('touchend', button._mobileTouchEndHandler);
            
            // Handler tactile avec feedback visuel
            button._mobileTouchStartHandler = (e) => {
                e.preventDefault();
                button.classList.add('touched');
                button.style.transform = 'scale(0.95)';
            };
            
            button._mobileTouchEndHandler = (e) => {
                e.preventDefault();
                button.classList.remove('touched');
                button.style.transform = '';
                
                // Déclencher l'action du bouton
                setTimeout(() => {
                    button.click();
                }, 10);
            };
            
            button._mobileClickHandler = (e) => {
                e.stopPropagation();
                
                const action = button.dataset.action || button.className;
                console.log(`[MobileTouchFix] Action bouton: ${action} pour ${name}`);
                
                // Gérer les actions spécifiques
                if (action.includes('solo')) {
                    this.toggleSolo(name);
                } else if (action.includes('mute')) {
                    this.toggleMute(name);
                }
            };
            
            // Ajouter les nouveaux listeners
            button.addEventListener('touchstart', button._mobileTouchStartHandler, { passive: false });
            button.addEventListener('touchend', button._mobileTouchEndHandler, { passive: false });
            button.addEventListener('click', button._mobileClickHandler, { passive: false });
            
            // Améliorer l'accessibilité tactile
            button.style.cssText += `
                touch-action: manipulation;
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
                min-height: 44px;
                min-width: 44px;
                cursor: pointer;
            `;
        });
        
        // Améliorer les sliders/ranges
        const sliders = trackElement.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                const control = e.target.dataset.control;
                
                console.log(`[MobileTouchFix] Slider ${control}: ${value} pour ${name}`);
                
                if (control === 'volume') {
                    this.setStemVolume(name, value);
                } else if (control === 'pan') {
                    this.setStemPan(name, value);
                }
            });
            
            // Améliorer le style tactile
            slider.style.cssText += `
                touch-action: manipulation;
                height: 44px;
                cursor: pointer;
            `;
        });
        
        // Améliorer la waveform pour la responsivité tactile
        const waveform = trackElement.querySelector('.waveform-container, .waveform');
        if (waveform) {
            waveform.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const rect = waveform.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const progress = x / rect.width;
                
                if (progress >= 0 && progress <= 1 && this.mixer.maxDuration > 0) {
                    const newTime = progress * this.mixer.maxDuration;
                    this.mixer.seek(newTime);
                }
            }, { passive: false });
            
            waveform.style.cssText += `
                touch-action: manipulation;
                user-select: none;
                cursor: pointer;
            `;
        }
    };
    
    // Améliorer toggleSolo pour mobile
    const originalToggleSolo = TrackControls.prototype.toggleSolo;
    TrackControls.prototype.toggleSolo = function(name) {
        console.log(`[MobileTouchFix] Toggle solo pour ${name}`);
        
        const result = originalToggleSolo.call(this, name);
        
        // Force la mise à jour visuelle
        setTimeout(() => {
            const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
            if (trackElement) {
                const soloBtn = trackElement.querySelector('.solo, [data-action*="solo"]');
                const isSolo = this.mixer.audioEngine.audioElements?.[name]?.solo || false;
                
                if (soloBtn) {
                    soloBtn.classList.toggle('active', isSolo);
                    soloBtn.style.backgroundColor = isSolo ? '#007AFF' : '';
                    soloBtn.style.color = isSolo ? 'white' : '';
                }
            }
        }, 50);
        
        return result;
    };
    
    // Améliorer toggleMute pour mobile
    const originalToggleMute = TrackControls.prototype.toggleMute;
    TrackControls.prototype.toggleMute = function(name) {
        console.log(`[MobileTouchFix] Toggle mute pour ${name}`);
        
        const result = originalToggleMute.call(this, name);
        
        // Force la mise à jour visuelle
        setTimeout(() => {
            const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
            if (trackElement) {
                const muteBtn = trackElement.querySelector('.mute, [data-action*="mute"]');
                const isMuted = this.mixer.audioEngine.audioElements?.[name]?.muted || false;
                
                if (muteBtn) {
                    muteBtn.classList.toggle('active', isMuted);
                    muteBtn.style.backgroundColor = isMuted ? '#FF3B30' : '';
                    muteBtn.style.color = isMuted ? 'white' : '';
                }
            }
        }, 50);
        
        return result;
    };
    
    // Améliorer setStemVolume pour mobile
    const originalSetStemVolume = TrackControls.prototype.setStemVolume;
    TrackControls.prototype.setStemVolume = function(name, volume) {
        console.log(`[MobileTouchFix] Set volume ${volume} pour ${name}`);
        
        const result = originalSetStemVolume.call(this, name, volume);
        
        // Mise à jour visuelle du slider
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (trackElement) {
            const volumeSlider = trackElement.querySelector('input[type="range"][data-control="volume"]');
            if (volumeSlider && volumeSlider.value != volume) {
                volumeSlider.value = volume;
            }
            
            // Afficher la valeur
            const volumeLabel = trackElement.querySelector('.control-label');
            if (volumeLabel) {
                volumeLabel.textContent = `Volume: ${Math.round(volume * 100)}%`;
            }
        }
        
        return result;
    };
}

// CSS pour améliorer l'expérience tactile
const mobileTouchCSS = `
    .touched {
        background-color: rgba(0, 122, 255, 0.2) !important;
        transform: scale(0.95) !important;
    }
    
    .control-button:active {
        transform: scale(0.95) !important;
        background-color: #007AFF !important;
        color: white !important;
    }
    
    .control-button.active {
        background-color: #007AFF !important;
        color: white !important;
    }
    
    @media (max-width: 768px) {
        .track button, .control-button {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            min-height: 44px;
            min-width: 44px;
            padding: 12px 16px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 8px;
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        input[type="range"] {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            height: 44px;
            cursor: pointer;
        }
        
        .waveform-container, .waveform {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            cursor: pointer;
        }
    }
`;

// Ajouter le CSS
const style = document.createElement('style');
style.textContent = mobileTouchCSS;
document.head.appendChild(style);

console.log('[MobileTouchFix] Améliorations tactiles mobiles chargées');
