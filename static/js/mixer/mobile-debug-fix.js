/**
 * Code Android qui fonctionne + Logs visibles pour iPhone debug
 */

console.log('[MobileDebugFix] Script chargé');

// Debug désactivé - Gardé pour référence future si besoin de debug
/*
let debugDiv = null;

function createDebugDisplay() {
    if (debugDiv) return;
    
    debugDiv = document.createElement('div');
    debugDiv.id = 'mobile-debug';
    debugDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 250px;
        max-height: 300px;
        background: rgba(0,0,0,0.9);
        color: white;
        font-size: 12px;
        padding: 10px;
        border-radius: 5px;
        z-index: 9999;
        overflow-y: auto;
        font-family: monospace;
        border: 1px solid #333;
    `;
    
    debugDiv.innerHTML = '<div style="color: #00ff00; font-weight: bold;">📱 Debug iPhone:</div>';
    document.body.appendChild(debugDiv);
    
    debugLog('Debug display créé');
}
*/

function debugLog(message) {
    // Debug désactivé - juste log console si besoin
    console.log('[MobileDebugFix] ' + message);
}

document.addEventListener('DOMContentLoaded', function() {
    debugLog('DOM ready');
    
    // Debug display désactivé
    // createDebugDisplay();
    
    // Attendre que le mixer soit prêt (MÊME LOGIQUE QU'ANDROID)
    const waitForMixer = () => {
        if (window.stemMixer && window.stemMixer.audioEngine) {
            debugLog('✅ Mixer trouvé, setup contrôles');
            setupMobileControlsAndroid();
            
            // Observer les nouvelles pistes (MÊME LOGIQUE QU'ANDROID)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.classList && node.classList.contains('track')) {
                            debugLog('🎵 Nouvelle piste détectée');
                            setupTrackAndroidStyle(node);
                        }
                    });
                });
            });
            
            const tracksContainer = document.getElementById('tracks') || document.querySelector('.tracks-container');
            if (tracksContainer) {
                observer.observe(tracksContainer, { childList: true });
                debugLog('📋 Observer configuré');
            } else {
                debugLog('❌ Tracks container non trouvé');
            }
        } else {
            debugLog('⏳ Mixer pas prêt, retry...');
            setTimeout(waitForMixer, 500);
        }
    };
    
    waitForMixer();
});

function setupMobileControlsAndroid() {
    debugLog('Setup contrôles existants');
    
    // Setup toutes les pistes existantes (MÊME LOGIQUE QU'ANDROID)
    const tracks = document.querySelectorAll('.track');
    debugLog(`📊 ${tracks.length} pistes trouvées`);
    
    tracks.forEach((track, index) => {
        debugLog(`🎵 Setup piste ${index + 1}/${tracks.length}`);
        setupTrackAndroidStyle(track);
    });
}

function setupTrackAndroidStyle(track) {
    const stemName = track.dataset.stem;
    if (!stemName) {
        debugLog('❌ Pas de stemName');
        return;
    }
    
    debugLog(`🔧 Setup ${stemName}`);
    
    // SOLO BUTTON (LOGIQUE ANDROID EXACTE)
    const soloBtn = track.querySelector('.solo-btn') || track.querySelector('[data-stem="' + stemName + '"]').closest('button');
    if (soloBtn && soloBtn.textContent.includes('Solo')) {
        debugLog(`✅ Solo button trouvé pour ${stemName}`);
        
        // Nettoyer anciens listeners (MÊME MÉTHODE QU'ANDROID)
        const newSoloBtn = soloBtn.cloneNode(true);
        soloBtn.parentNode.replaceChild(newSoloBtn, soloBtn);
        
        // Event handler EXACTEMENT comme Android
        const soloHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            debugLog(`🎧 SOLO CLICKED ${stemName}`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemSolo) {
                const currentSolo = mixer.audioEngine.audioElements[stemName]?.solo || false;
                const newSolo = !currentSolo;
                
                debugLog(`🎧 AVANT setStemSolo: ${currentSolo}`);
                mixer.audioEngine.setStemSolo(stemName, newSolo);
                
                // Vérifier que ça a marché
                const afterSolo = mixer.audioEngine.audioElements[stemName]?.solo || false;
                debugLog(`🎧 APRÈS setStemSolo: ${afterSolo}`);
                
                // Feedback visuel
                newSoloBtn.style.backgroundColor = newSolo ? '#007AFF' : '';
                newSoloBtn.style.color = newSolo ? 'white' : '';
                
                debugLog(`🎧 Solo ${stemName}: ${currentSolo} → ${newSolo}`);
            } else {
                debugLog(`❌ Mixer/audioEngine manquant pour solo`);
                debugLog(`mixer: ${!!mixer}, audioEngine: ${!!mixer?.audioEngine}, setStemSolo: ${!!mixer?.audioEngine?.setStemSolo}`);
            }
        };
        
        // MÊMES ÉVÉNEMENTS QU'ANDROID
        newSoloBtn.addEventListener('click', soloHandler);
        newSoloBtn.addEventListener('touchend', soloHandler);
    } else {
        debugLog(`❌ Solo button non trouvé pour ${stemName}`);
    }
    
    // MUTE BUTTON (LOGIQUE ANDROID EXACTE)
    const muteBtn = track.querySelector('.mute-btn') || 
                   [...track.querySelectorAll('button')].find(btn => btn.textContent.includes('Mute'));
    if (muteBtn) {
        debugLog(`✅ Mute button trouvé pour ${stemName}`);
        
        // Nettoyer anciens listeners
        const newMuteBtn = muteBtn.cloneNode(true);
        muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
        
        const muteHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            debugLog(`🔇 MUTE CLICKED ${stemName}`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemMuted) {
                const currentMute = mixer.audioEngine.audioElements[stemName]?.muted || false;
                const newMute = !currentMute;
                
                debugLog(`🔇 AVANT setStemMuted: ${currentMute}`);
                mixer.audioEngine.setStemMuted(stemName, newMute);
                
                // Vérifier que ça a marché
                const afterMute = mixer.audioEngine.audioElements[stemName]?.muted || false;
                debugLog(`🔇 APRÈS setStemMuted: ${afterMute}`);
                
                // Feedback visuel
                newMuteBtn.style.backgroundColor = newMute ? '#FF3B30' : '';
                newMuteBtn.style.color = newMute ? 'white' : '';
                
                debugLog(`🔇 Mute ${stemName}: ${currentMute} → ${newMute}`);
            } else {
                debugLog(`❌ Mixer/audioEngine manquant pour mute`);
                debugLog(`mixer: ${!!mixer}, audioEngine: ${!!mixer?.audioEngine}, setStemMuted: ${!!mixer?.audioEngine?.setStemMuted}`);
            }
        };
        
        // MÊMES ÉVÉNEMENTS QU'ANDROID
        newMuteBtn.addEventListener('click', muteHandler);
        newMuteBtn.addEventListener('touchend', muteHandler);
    } else {
        debugLog(`❌ Mute button non trouvé pour ${stemName}`);
    }
    
    // VOLUME SLIDER
    const volumeSlider = track.querySelector('.volume-slider') || 
                        track.querySelector('[data-stem="' + stemName + '"][type="range"]');
    if (volumeSlider) {
        debugLog(`✅ Volume slider trouvé pour ${stemName}`);
        
        const volumeHandler = function(e) {
            const volume = parseFloat(e.target.value);
            debugLog(`🔊 VOLUME CHANGE for ${stemName}: ${volume} (${e.type})`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemVolume) {
                debugLog(`🔊 AVANT setStemVolume: ${mixer.audioEngine.audioElements[stemName]?.volume}`);
                mixer.audioEngine.setStemVolume(stemName, volume);
                
                // Vérifier que ça a marché
                debugLog(`🔊 APRÈS setStemVolume: ${mixer.audioEngine.audioElements[stemName]?.volume}`);
                
                // Mettre à jour l'affichage
                const volumeValue = track.querySelector('.volume-value');
                if (volumeValue) {
                    volumeValue.textContent = Math.round(volume * 100) + '%';
                }
                debugLog(`✅ Volume mis à jour`);
            } else {
                debugLog(`❌ Mixer/audioEngine manquant pour volume`);
                debugLog(`mixer: ${!!mixer}, audioEngine: ${!!mixer?.audioEngine}, setStemVolume: ${!!mixer?.audioEngine?.setStemVolume}`);
            }
        };
        
        // Détecter si c'est iOS pour traitement spécial
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            debugLog(`🍎 iOS Volume Setup pour ${stemName}`);
            
            // iOS: événements tactiles spécifiques pour sliders
            volumeSlider.addEventListener('touchstart', function(e) {
                debugLog(`🍎 Volume touchstart ${stemName}`);
                e.stopPropagation(); // Éviter les conflits
            }, { passive: false });
            
            volumeSlider.addEventListener('touchmove', function(e) {
                debugLog(`🍎 Volume touchmove ${stemName}: ${e.target.value}`);
                volumeHandler(e);
            }, { passive: false });
            
            volumeSlider.addEventListener('touchend', function(e) {
                debugLog(`🍎 Volume touchend ${stemName}: ${e.target.value}`);
                volumeHandler(e);
            }, { passive: false });
            
            // iOS: Force update on value change
            volumeSlider.addEventListener('change', function(e) {
                debugLog(`🍎 Volume change ${stemName}: ${e.target.value}`);
                volumeHandler(e);
            });
        }
        
        // Événements standards (Android/PC)
        volumeSlider.addEventListener('input', volumeHandler);
        volumeSlider.addEventListener('change', volumeHandler);
    } else {
        debugLog(`❌ Volume slider non trouvé pour ${stemName}`);
    }
    
    // PAN SLIDER (limité sur mobile)
    const panSlider = track.querySelector('.pan-knob') || 
                     [...track.querySelectorAll('input[type="range"]')].find(slider => 
                         slider !== volumeSlider);
    if (panSlider) {
        debugLog(`✅ Pan slider trouvé pour ${stemName} (support limité mobile)`);
        
        const panHandler = function(e) {
            const pan = parseFloat(e.target.value);
            debugLog(`🎛️ PAN CHANGE for ${stemName}: ${pan} (${e.type})`);
            debugLog(`⚠️ Pan non supporté sur mobile HTML5 Audio`);
            
            const mixer = window.stemMixer;
            if (mixer && mixer.audioEngine && mixer.audioEngine.setStemPan) {
                debugLog(`🎛️ AVANT setStemPan: ${mixer.audioEngine.audioElements[stemName]?.pan}`);
                mixer.audioEngine.setStemPan(stemName, pan);
                
                // Vérifier que ça a marché
                debugLog(`🎛️ APRÈS setStemPan: ${mixer.audioEngine.audioElements[stemName]?.pan}`);
                
                // Mettre à jour l'affichage
                const panValue = track.querySelector('.pan-value');
                if (panValue) {
                    panValue.textContent = pan.toFixed(2);
                }
                debugLog(`✅ Pan mis à jour (visuel seulement)`);
            } else {
                debugLog(`❌ Mixer/audioEngine manquant pour pan`);
                debugLog(`mixer: ${!!mixer}, audioEngine: ${!!mixer?.audioEngine}, setStemPan: ${!!mixer?.audioEngine?.setStemPan}`);
            }
        };
        
        // iOS: mêmes événements tactiles pour Pan
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            debugLog(`🍎 iOS Pan Setup pour ${stemName}`);
            
            panSlider.addEventListener('touchstart', function(e) {
                debugLog(`🍎 Pan touchstart ${stemName}`);
                e.stopPropagation();
            }, { passive: false });
            
            panSlider.addEventListener('touchmove', function(e) {
                debugLog(`🍎 Pan touchmove ${stemName}: ${e.target.value}`);
                panHandler(e);
            }, { passive: false });
            
            panSlider.addEventListener('touchend', function(e) {
                debugLog(`🍎 Pan touchend ${stemName}: ${e.target.value}`);
                panHandler(e);
            }, { passive: false });
            
            panSlider.addEventListener('change', function(e) {
                debugLog(`🍎 Pan change ${stemName}: ${e.target.value}`);
                panHandler(e);
            });
        }
        
        // Événements standards
        panSlider.addEventListener('input', panHandler);
        panSlider.addEventListener('change', panHandler);
    } else {
        debugLog(`❌ Pan slider non trouvé pour ${stemName}`);
    }
    
    // MÊME STYLE QU'ANDROID
    const buttons = track.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.style.cssText += `
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            min-height: 44px;
            min-width: 44px;
            cursor: pointer;
        `;
    });
    
    const sliders = track.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        slider.style.cssText += `
            touch-action: manipulation;
            height: 44px;
            cursor: pointer;
        `;
    });
    
    debugLog(`✅ Styles appliqués pour ${stemName}`);
}

debugLog('Script ready');
