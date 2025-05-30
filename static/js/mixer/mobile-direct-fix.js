/**
 * Correction DIRECTE et SIMPLE pour mobile - Android et iOS
 */

console.log('[MobileDirectFix] Script chargé');

document.addEventListener('DOMContentLoaded', function() {
    console.log('[MobileDirectFix] DOM ready');
    
    // Attendre que le mixer soit prêt
    const waitForMixer = () => {
        if (window.stemMixer && window.stemMixer.audioEngine) {
            console.log('[MobileDirectFix] Mixer trouvé, setup des contrôles');
            setupDirectMobileControls();
            
            // Observer les nouvelles pistes
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.classList && node.classList.contains('track')) {
                            console.log('[MobileDirectFix] Nouvelle piste détectée');
                            setupTrackDirectControls(node);
                        }
                    });
                });
            });
            
            const tracksContainer = document.getElementById('tracks') || document.querySelector('.tracks-container');
            if (tracksContainer) {
                observer.observe(tracksContainer, { childList: true });
            }
        } else {
            console.log('[MobileDirectFix] Mixer pas prêt, retry...');
            setTimeout(waitForMixer, 500);
        }
    };
    
    waitForMixer();
});

function setupDirectMobileControls() {
    console.log('[MobileDirectFix] Setup contrôles existants');
    
    // Setup toutes les pistes existantes
    const tracks = document.querySelectorAll('.track');
    tracks.forEach(track => {
        setupTrackDirectControls(track);
    });
}

function setupTrackDirectControls(track) {
    const stemName = track.dataset.stem;
    if (!stemName) return;
    
    console.log(`[MobileDirectFix] Setup contrôles pour ${stemName}`);
    
    // Détecter iOS pour un traitement spécial
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    console.log(`[MobileDirectFix] iOS détecté: ${isIOS}`);
    
    // SOLO BUTTON
    const soloBtn = track.querySelector('.solo-btn') || track.querySelector('[data-stem="' + stemName + '"]').closest('button');
    if (soloBtn && soloBtn.textContent.includes('Solo')) {
        console.log(`[MobileDirectFix] Solo button trouvé pour ${stemName}`);
        
        // Nettoyer anciens listeners
        const newSoloBtn = soloBtn.cloneNode(true);
        soloBtn.parentNode.replaceChild(newSoloBtn, soloBtn);
        
        // Handler unifié pour iOS et Android
        const soloHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            console.log(`[MobileDirectFix] SOLO CLICKED for ${stemName} (${e.type})`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemSolo) {
                const currentSolo = mixer.audioEngine.audioElements[stemName]?.solo || false;
                const newSolo = !currentSolo;
                
                mixer.audioEngine.setStemSolo(stemName, newSolo);
                
                // Feedback visuel
                newSoloBtn.style.backgroundColor = newSolo ? '#007AFF' : '';
                newSoloBtn.style.color = newSolo ? 'white' : '';
                newSoloBtn.classList.toggle('active', newSolo);
                
                console.log(`[MobileDirectFix] Solo ${stemName}: ${currentSolo} -> ${newSolo}`);
            }
        };
        
        // Événements iOS spécifiques
        if (isIOS) {
            newSoloBtn.addEventListener('touchstart', function(e) {
                e.preventDefault();
                console.log(`[MobileDirectFix] iOS touchstart solo ${stemName}`);
            }, { passive: false });
            
            newSoloBtn.addEventListener('touchend', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`[MobileDirectFix] iOS touchend solo ${stemName}`);
                soloHandler(e);
            }, { passive: false });
        }
        
        // Click fallback pour tous
        newSoloBtn.addEventListener('click', soloHandler, { passive: false });
        
        // Style iOS
        newSoloBtn.style.cssText += `
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            touch-action: manipulation;
        `;
    }
    
    // MUTE BUTTON
    const muteBtn = track.querySelector('.mute-btn') || 
                   [...track.querySelectorAll('button')].find(btn => btn.textContent.includes('Mute'));
    if (muteBtn) {
        console.log(`[MobileDirectFix] Mute button trouvé pour ${stemName}`);
        
        // Nettoyer anciens listeners
        const newMuteBtn = muteBtn.cloneNode(true);
        muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
        
        // Handler unifié
        const muteHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            console.log(`[MobileDirectFix] MUTE CLICKED for ${stemName} (${e.type})`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemMuted) {
                const currentMute = mixer.audioEngine.audioElements[stemName]?.muted || false;
                const newMute = !currentMute;
                
                mixer.audioEngine.setStemMuted(stemName, newMute);
                
                // Feedback visuel
                newMuteBtn.style.backgroundColor = newMute ? '#FF3B30' : '';
                newMuteBtn.style.color = newMute ? 'white' : '';
                newMuteBtn.classList.toggle('active', newMute);
                
                console.log(`[MobileDirectFix] Mute ${stemName}: ${currentMute} -> ${newMute}`);
            }
        };
        
        // Événements iOS spécifiques
        if (isIOS) {
            newMuteBtn.addEventListener('touchstart', function(e) {
                e.preventDefault();
                console.log(`[MobileDirectFix] iOS touchstart mute ${stemName}`);
            }, { passive: false });
            
            newMuteBtn.addEventListener('touchend', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`[MobileDirectFix] iOS touchend mute ${stemName}`);
                muteHandler(e);
            }, { passive: false });
        }
        
        // Click fallback
        newMuteBtn.addEventListener('click', muteHandler, { passive: false });
        
        // Style iOS
        newMuteBtn.style.cssText += `
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            touch-action: manipulation;
        `;
    }
    
    // VOLUME SLIDER
    const volumeSlider = track.querySelector('.volume-slider') || 
                        track.querySelector('[data-stem="' + stemName + '"][type="range"]');
    if (volumeSlider) {
        console.log(`[MobileDirectFix] Volume slider trouvé pour ${stemName}`);
        
        const volumeHandler = function(e) {
            const volume = parseFloat(e.target.value);
            console.log(`[MobileDirectFix] VOLUME CHANGE for ${stemName}: ${volume} (${e.type})`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemVolume) {
                mixer.audioEngine.setStemVolume(stemName, volume);
                
                // Mettre à jour l'affichage
                const volumeValue = track.querySelector('.volume-value');
                if (volumeValue) {
                    volumeValue.textContent = Math.round(volume * 100) + '%';
                }
            }
        };
        
        // iOS nécessite des événements spécifiques pour les sliders
        if (isIOS) {
            volumeSlider.addEventListener('touchstart', function(e) {
                console.log(`[MobileDirectFix] iOS volume touchstart ${stemName}`);
            }, { passive: true });
            
            volumeSlider.addEventListener('touchmove', volumeHandler, { passive: true });
            volumeSlider.addEventListener('touchend', volumeHandler, { passive: true });
        }
        
        volumeSlider.addEventListener('input', volumeHandler);
        volumeSlider.addEventListener('change', volumeHandler);
        
        // Style iOS pour slider
        volumeSlider.style.cssText += `
            -webkit-appearance: none;
            touch-action: manipulation;
        `;
    }
    
    // PAN SLIDER
    const panSlider = track.querySelector('.pan-knob') || 
                     [...track.querySelectorAll('input[type="range"]')].find(slider => 
                         slider !== volumeSlider);
    if (panSlider) {
        console.log(`[MobileDirectFix] Pan slider trouvé pour ${stemName}`);
        
        const panHandler = function(e) {
            const pan = parseFloat(e.target.value);
            console.log(`[MobileDirectFix] PAN CHANGE for ${stemName}: ${pan} (${e.type})`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemPan) {
                mixer.audioEngine.setStemPan(stemName, pan);
                
                // Mettre à jour l'affichage
                const panValue = track.querySelector('.pan-value');
                if (panValue) {
                    panValue.textContent = pan.toFixed(2);
                }
            }
        };
        
        // iOS sliders
        if (isIOS) {
            panSlider.addEventListener('touchstart', function(e) {
                console.log(`[MobileDirectFix] iOS pan touchstart ${stemName}`);
            }, { passive: true });
            
            panSlider.addEventListener('touchmove', panHandler, { passive: true });
            panSlider.addEventListener('touchend', panHandler, { passive: true });
        }
        
        panSlider.addEventListener('input', panHandler);
        panSlider.addEventListener('change', panHandler);
        
        // Style iOS pour slider
        panSlider.style.cssText += `
            -webkit-appearance: none;
            touch-action: manipulation;
        `;
    }
    
    // Style mobile général amélioré pour iOS
    const buttons = track.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.style.cssText += `
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            min-height: 44px;
            min-width: 44px;
            cursor: pointer;
        `;
    });
    
    const sliders = track.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        slider.style.cssText += `
            touch-action: manipulation;
            -webkit-appearance: none;
            height: 44px;
            cursor: pointer;
        `;
    });
}

console.log('[MobileDirectFix] Script ready');
