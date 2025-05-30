/**
 * Corrections simples et efficaces pour mobile
 * Sans toast iOS inutile, avec contrôles Android fonctionnels
 */

// 1. SIMPLIFIER iOS - Pas de toast, juste unlock naturel
if (typeof MobileAudioEngine !== 'undefined') {
    
    // Override simple pour iOS - pas de toast
    const originalPlay = MobileAudioEngine.prototype.play;
    MobileAudioEngine.prototype.play = function() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            // Sur iOS, on essaie de jouer directement
            // L'unlock se fera automatiquement lors du premier clic utilisateur
            console.log('[iOS] Tentative de lecture directe');
        }
        
        return originalPlay.call(this);
    };
    
    // Supprimer les toasts iOS existants
    document.addEventListener('DOMContentLoaded', () => {
        const existingToasts = document.querySelectorAll('.ios-unlock-toast');
        existingToasts.forEach(toast => toast.remove());
    });
}

// 2. CORRIGER Android - Événements simples et directs
document.addEventListener('DOMContentLoaded', function() {
    console.log('[MobileSimpleFixes] Initialisation des corrections mobiles');
    
    // Attendre que le mixer soit initialisé
    setTimeout(() => {
        setupMobileControls();
    }, 1000);
});

function setupMobileControls() {
    console.log('[MobileSimpleFixes] Configuration des contrôles mobiles');
    
    // Récupérer le mixer global
    const mixer = window.stemMixer;
    if (!mixer) {
        console.log('[MobileSimpleFixes] Mixer non trouvé, retry...');
        setTimeout(setupMobileControls, 500);
        return;
    }
    
    // Observer les nouvelles pistes ajoutées
    const tracksContainer = document.getElementById('tracks');
    if (!tracksContainer) return;
    
    // Configurer les pistes existantes
    const tracks = tracksContainer.querySelectorAll('.track');
    tracks.forEach(track => {
        const stemName = track.dataset.stem;
        if (stemName) {
            setupTrackControls(track, stemName, mixer);
        }
    });
    
    // Observer les nouvelles pistes
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.classList && node.classList.contains('track')) {
                    const stemName = node.dataset.stem;
                    if (stemName) {
                        setupTrackControls(node, stemName, mixer);
                    }
                }
            });
        });
    });
    
    observer.observe(tracksContainer, { childList: true });
}

function setupTrackControls(trackElement, stemName, mixer) {
    console.log(`[MobileSimpleFixes] Configuration contrôles pour ${stemName}`);
    
    // Nettoyer les anciens listeners
    const buttons = trackElement.querySelectorAll('button, input');
    buttons.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    
    // Récupérer les nouveaux éléments (après clonage)
    const soloBtn = trackElement.querySelector('button:nth-of-type(1)') || 
                   trackElement.querySelector('.solo') ||
                   trackElement.querySelector('[data-action*="solo"]');
    
    const muteBtn = trackElement.querySelector('button:nth-of-type(2)') || 
                   trackElement.querySelector('.mute') ||
                   trackElement.querySelector('[data-action*="mute"]');
    
    const volumeSlider = trackElement.querySelector('input[type="range"]:nth-of-type(1)') ||
                        trackElement.querySelector('.volume-slider') ||
                        trackElement.querySelector('[data-control="volume"]');
    
    const panSlider = trackElement.querySelector('input[type="range"]:nth-of-type(2)') ||
                     trackElement.querySelector('.pan-slider') ||
                     trackElement.querySelector('[data-control="pan"]');
    
    // SOLO BUTTON
    if (soloBtn) {
        console.log(`[MobileSimpleFixes] Solo button trouvé pour ${stemName}`);
        
        const soloHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log(`[MobileSimpleFixes] Solo cliqué pour ${stemName}`);
            
            if (mixer.audioEngine && mixer.audioEngine.audioElements && mixer.audioEngine.audioElements[stemName]) {
                const currentSolo = mixer.audioEngine.audioElements[stemName].solo || false;
                const newSolo = !currentSolo;
                
                // Mettre à jour l'état
                mixer.audioEngine.setStemSolo(stemName, newSolo);
                
                // Mettre à jour visuellement
                soloBtn.classList.toggle('active', newSolo);
                soloBtn.style.backgroundColor = newSolo ? '#007AFF' : '';
                soloBtn.style.color = newSolo ? 'white' : '';
                
                console.log(`[MobileSimpleFixes] Solo ${stemName}: ${newSolo}`);
            }
        };
        
        soloBtn.addEventListener('click', soloHandler);
        soloBtn.addEventListener('touchend', soloHandler);
    }
    
    // MUTE BUTTON
    if (muteBtn) {
        console.log(`[MobileSimpleFixes] Mute button trouvé pour ${stemName}`);
        
        const muteHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log(`[MobileSimpleFixes] Mute cliqué pour ${stemName}`);
            
            if (mixer.audioEngine && mixer.audioEngine.audioElements && mixer.audioEngine.audioElements[stemName]) {
                const currentMute = mixer.audioEngine.audioElements[stemName].muted || false;
                const newMute = !currentMute;
                
                // Mettre à jour l'état
                mixer.audioEngine.setStemMuted(stemName, newMute);
                
                // Mettre à jour visuellement
                muteBtn.classList.toggle('active', newMute);
                muteBtn.style.backgroundColor = newMute ? '#FF3B30' : '';
                muteBtn.style.color = newMute ? 'white' : '';
                
                console.log(`[MobileSimpleFixes] Mute ${stemName}: ${newMute}`);
            }
        };
        
        muteBtn.addEventListener('click', muteHandler);
        muteBtn.addEventListener('touchend', muteHandler);
    }
    
    // VOLUME SLIDER
    if (volumeSlider) {
        console.log(`[MobileSimpleFixes] Volume slider trouvé pour ${stemName}`);
        
        const volumeHandler = (e) => {
            const volume = parseFloat(e.target.value);
            console.log(`[MobileSimpleFixes] Volume ${stemName}: ${volume}`);
            
            if (mixer.audioEngine && mixer.audioEngine.audioElements && mixer.audioEngine.audioElements[stemName]) {
                mixer.audioEngine.setStemVolume(stemName, volume);
            }
        };
        
        volumeSlider.addEventListener('input', volumeHandler);
        volumeSlider.addEventListener('change', volumeHandler);
    }
    
    // PAN SLIDER
    if (panSlider) {
        console.log(`[MobileSimpleFixes] Pan slider trouvé pour ${stemName}`);
        
        const panHandler = (e) => {
            const pan = parseFloat(e.target.value);
            console.log(`[MobileSimpleFixes] Pan ${stemName}: ${pan}`);
            
            if (mixer.audioEngine && mixer.audioEngine.audioElements && mixer.audioEngine.audioElements[stemName]) {
                mixer.audioEngine.setStemPan(stemName, pan);
            }
        };
        
        panSlider.addEventListener('input', panHandler);
        panSlider.addEventListener('change', panHandler);
    }
    
    // Améliorer le style tactile
    buttons.forEach(element => {
        element.style.cssText += `
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            cursor: pointer;
        `;
        
        if (element.tagName === 'BUTTON') {
            element.style.cssText += `
                min-height: 44px;
                min-width: 44px;
                padding: 12px;
                font-size: 16px;
            `;
        }
        
        if (element.type === 'range') {
            element.style.cssText += `
                height: 44px;
                width: 100%;
            `;
        }
    });
}

console.log('[MobileSimpleFixes] Script chargé');
