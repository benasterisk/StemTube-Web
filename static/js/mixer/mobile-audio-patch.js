/**
 * Patch pour ajouter les variables iOS au MobileAudioEngine
 * À charger avant mobile-audio-fixes.js
 */

// Patch du constructeur MobileAudioEngine
if (typeof MobileAudioEngine !== 'undefined') {
    const originalConstructor = MobileAudioEngine;
    
    window.MobileAudioEngine = function(mixer) {
        // Appeler le constructeur original
        originalConstructor.call(this, mixer);
        
        // Ajouter les variables iOS
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.audioUnlocked = false;
        this.unlockInProgress = false;
        this.timeUpdateInterval = null;
        
        // Initialiser l'unlock iOS si nécessaire
        if (this.isIOS) {
            // On attend que les fixes soient chargés
            setTimeout(() => {
                if (this.initIOSAudioUnlock) {
                    this.initIOSAudioUnlock();
                }
            }, 100);
        }
    };
    
    // Copier le prototype
    window.MobileAudioEngine.prototype = originalConstructor.prototype;
    window.MobileAudioEngine.prototype.constructor = window.MobileAudioEngine;
    
    console.log('[MobileAudioPatch] Patch iOS appliqué au MobileAudioEngine');
}
