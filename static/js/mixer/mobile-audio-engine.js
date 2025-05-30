/**
 * StemTubes Mixer - Mobile Audio Engine
 * Moteur audio optimisé pour les appareils mobiles
 * Utilise HTML5 Audio Elements au lieu de Web Audio API pour une meilleure compatibilité
 */

class MobileAudioEngine {
    /**
     * Constructeur du moteur audio mobile
     * @param {StemMixer} mixer - Instance principale du mixeur
     */
    constructor(mixer) {
        this.mixer = mixer;
        this.audioElements = {};
        this.startTime = 0;
        this.animationFrameId = null;
        this.isPausing = false;
        this.masterVolume = 1.0;
        this.allStemsLoaded = false;
        this.stemsLoadedCount = 0;
    }
    
    /**
     * Initialiser le contexte audio mobile
     */
    async initAudioContext() {
        try {
            this.mixer.log('Initialisation du moteur audio mobile...');
            
            // Pas besoin de contexte audio spécial pour mobile
            // On utilisera des éléments HTML5 audio
            
            this.mixer.log('Moteur audio mobile initialisé');
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors de l'initialisation du moteur audio mobile: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Charger un stem
     * @param {string} name - Nom du stem
     * @param {string} url - URL du fichier audio
     */
    async loadStem(name, url) {
        try {
            this.mixer.log(`Chargement du stem mobile: ${name}`);
            
            // Vérifier si le fichier existe
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) {
                this.mixer.log(`Le stem ${name} n'existe pas (${response.status})`);
                return false;
            }
            
            // Créer un élément audio HTML5
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.preload = 'auto';
            
            // Promise pour attendre le chargement complet
            const loadPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout de chargement'));
                }, 10000); // 10 secondes timeout
                
                audio.addEventListener('loadedmetadata', () => {
                    clearTimeout(timeout);
                    this.mixer.log(`Métadonnées chargées pour ${name}: ${audio.duration}s`);
                    
                    // Ajouter le stem au mixer
                    this.mixer.stems[name] = {
                        buffer: audio,
                        duration: audio.duration,
                        waveformData: null
                    };
                    
                    // Mettre à jour la durée maximale du mixer
                    this.mixer.updateMaxDuration();
                    
                    resolve();
                });
                
                audio.addEventListener('canplaythrough', () => {
                    this.mixer.log(`${name} prêt pour la lecture`);
                });
                
                audio.addEventListener('error', (e) => {
                    clearTimeout(timeout);
                    reject(new Error(`Erreur de chargement: ${e.message || 'Erreur inconnue'}`));
                });
            });
            
            // Charger l'audio
            audio.src = url;
            
            // Attendre le chargement
            await loadPromise;
            
            // Stocker l'élément audio
            this.audioElements[name] = {
                audio: audio,
                volume: 1.0,
                pan: 0,
                muted: false,
                solo: false
            };
            
            // IMPORTANT: Créer l'élément de piste dans l'interface utilisateur
            if (this.mixer.trackControls) {
                this.mixer.trackControls.createTrackElement(name);
            }
            
            // Générer les données de waveform pour mobile (simplifié)
            this.generateMobileWaveform(name, audio);
            
            // Déclencher le rendu de la waveform
            if (this.mixer.waveform) {
                // Petite attente pour s'assurer que l'élément DOM est créé
                setTimeout(() => {
                    this.mixer.waveform.drawWaveform(name);
                }, 100);
            }
            
            this.stemsLoadedCount++;
            
            // Déclencher le rendu global des waveformes quand tous les stems sont chargés
            // (on utilise un timeout pour laisser le temps aux autres stems de finir leur chargement)
            setTimeout(() => {
                if (this.mixer.waveform) {
                    this.mixer.waveform.updateAllWaveforms();
                }
            }, 500);
            
            this.mixer.log(`Stem mobile ${name} chargé avec succès`);
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors du chargement du stem mobile ${name}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Générer une waveform simplifiée pour mobile
     * @param {string} name - Nom du stem
     * @param {HTMLAudioElement} audio - Élément audio
     */
    generateMobileWaveform(name, audio) {
        try {
            // Créer des données de waveform simplifiées pour mobile
            // (pour des raisons de performance, on utilise une waveform factice)
            const duration = audio.duration || 1;
            const sampleRate = 44100;
            const samples = Math.floor(duration * sampleRate);
            const downsampleFactor = 1000; // Réduire pour de meilleures performances
            const waveformLength = Math.floor(samples / downsampleFactor);
            
            // Générer une waveform simple basée sur la durée
            const waveformData = new Float32Array(waveformLength);
            for (let i = 0; i < waveformLength; i++) {
                // Créer une forme d'onde factice mais visuellement acceptable
                waveformData[i] = 0.5 + 0.3 * Math.sin(i * 0.01) * Math.random();
            }
            
            // Stocker les données de waveform
            if (this.mixer.stems[name]) {
                this.mixer.stems[name].waveformData = waveformData;
            }
            
            this.mixer.log(`Waveform mobile générée pour ${name}`);
        } catch (error) {
            this.mixer.log(`Erreur lors de la génération de waveform pour ${name}: ${error.message}`);
        }
    }
    
    /**
     * Jouer tous les stems
     */
    play() {
        try {
            this.mixer.log('Lecture mobile démarrée');
            this.startTime = Date.now() - (this.mixer.currentTime * 1000);
            
            // Démarrer la lecture de tous les stems
            Object.values(this.audioElements).forEach(stem => {
                stem.audio.currentTime = this.mixer.currentTime;
                stem.audio.play().catch(e => {
                    this.mixer.log(`Erreur de lecture: ${e.message}`);
                });
            });
            
            this.startTimeUpdate();
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors de la lecture mobile: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Mettre en pause tous les stems
     */
    pause() {
        try {
            this.mixer.log('Lecture mobile mise en pause');
            this.isPausing = true;
            
            // Mettre en pause tous les stems
            Object.values(this.audioElements).forEach(stem => {
                stem.audio.pause();
            });
            
            this.stopTimeUpdate();
            this.isPausing = false;
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors de la pause mobile: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Arrêter tous les stems
     */
    stop() {
        try {
            this.mixer.log('Lecture mobile arrêtée');
            
            // Arrêter et remettre à zéro tous les stems
            Object.values(this.audioElements).forEach(stem => {
                stem.audio.pause();
                stem.audio.currentTime = 0;
            });
            
            this.mixer.currentTime = 0;
            this.stopTimeUpdate();
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors de l'arrêt mobile: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Aller à une position spécifique
     * @param {number} time - Temps en secondes
     */
    seekTo(time) {
        try {
            this.mixer.log(`Seek mobile vers: ${time}s`);
            
            // Synchroniser tous les stems à la nouvelle position
            Object.values(this.audioElements).forEach(stem => {
                stem.audio.currentTime = time;
            });
            
            this.mixer.currentTime = time;
            this.startTime = Date.now() - (time * 1000);
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors du seek mobile: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Définir le volume d'un stem
     * @param {string} name - Nom du stem
     * @param {number} volume - Volume (0-1)
     */
    setStemVolume(name, volume) {
        if (this.audioElements[name]) {
            this.audioElements[name].volume = volume;
            this.updateStemAudio(name);
        }
    }
    
    /**
     * Définir le panoramique d'un stem (non supporté en mobile)
     * @param {string} name - Nom du stem
     * @param {number} pan - Panoramique (-1 à 1)
     */
    setStemPan(name, pan) {
        if (this.audioElements[name]) {
            this.audioElements[name].pan = pan;
            // Le panoramique n'est pas directement supporté avec HTML5 Audio
            // On peut simuler avec le volume gauche/droite mais c'est limité
        }
    }
    
    /**
     * Mettre en sourdine un stem
     * @param {string} name - Nom du stem
     * @param {boolean} muted - État de sourdine
     */
    setStemMuted(name, muted) {
        if (this.audioElements[name]) {
            this.audioElements[name].muted = muted;
            this.updateStemAudio(name);
        }
    }
    
    /**
     * Mettre un stem en solo
     * @param {string} name - Nom du stem
     * @param {boolean} solo - État de solo
     */
    setStemSolo(name, solo) {
        if (this.audioElements[name]) {
            this.audioElements[name].solo = solo;
            
            // Mettre à jour tous les stems pour gérer le solo
            Object.keys(this.audioElements).forEach(stemName => {
                this.updateStemAudio(stemName);
            });
        }
    }
    
    /**
     * Mettre à jour l'audio d'un stem
     * @param {string} name - Nom du stem
     */
    updateStemAudio(name) {
        const stem = this.audioElements[name];
        if (!stem) return;
        
        // Vérifier s'il y a des stems en solo
        const hasSolo = Object.values(this.audioElements).some(s => s.solo);
        
        // Calculer le volume final
        let finalVolume = stem.volume * this.masterVolume;
        
        // Déterminer si le stem doit être muet
        const shouldBeMuted = stem.muted || (hasSolo && !stem.solo);
        
        if (shouldBeMuted) {
            finalVolume = 0;
        }

        // Détecter iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (isIOS) {
            // Sur iOS, utiliser muted pour les changements de volume
            stem.audio.muted = shouldBeMuted || finalVolume === 0;
            // Stocker le volume pour référence
            stem.lastVolume = finalVolume;
        } else {
            // Sur les autres plateformes, utiliser volume normalement
            stem.audio.volume = Math.max(0, Math.min(1, finalVolume));
            stem.audio.muted = shouldBeMuted;
        }
        
        // Log pour debug
        this.mixer.log(`Audio mis à jour - ${name}: volume=${finalVolume}, muted=${stem.audio.muted}, solo=${stem.solo}, isIOS=${isIOS}`);
    }
    
    /**
     * Définir le volume principal
     * @param {number} volume - Volume principal (0-1)
     */
    setMasterVolume(volume) {
        this.masterVolume = volume;
        
        // Mettre à jour tous les stems
        Object.keys(this.audioElements).forEach(name => {
            this.updateStemAudio(name);
        });
    }
    
    /**
     * Démarrer la mise à jour du temps
     */
    startTimeUpdate() {
        this.stopTimeUpdate(); // Arrêter l'ancien timer s'il existe
        
        const updateLoop = () => {
            this.updateTime();
            this.animationFrameId = requestAnimationFrame(updateLoop);
        };
        
        this.animationFrameId = requestAnimationFrame(updateLoop);
    }
    
    /**
     * Mettre à jour le temps et le playhead
     */
    updateTime() {
        // Obtenir le temps depuis le premier stem disponible
        const firstStem = Object.values(this.audioElements)[0];
        if (firstStem && firstStem.audio && !firstStem.audio.paused) {
            const currentTime = firstStem.audio.currentTime;
            this.mixer.currentTime = currentTime;
            
            // Mettre à jour le playhead
            if (this.mixer.timeline && this.mixer.timeline.updatePlayhead) {
                this.mixer.timeline.updatePlayhead(currentTime);
            }
            
            // Mettre à jour les waveforms
            if (this.mixer.waveforms) {
                Object.values(this.mixer.waveforms).forEach(waveform => {
                    if (waveform.updatePlayhead) {
                        waveform.updatePlayhead(currentTime);
                    }
                });
            }
        }
    }
    
    /**
     * Arrêter la mise à jour du temps
     */
    stopTimeUpdate() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Obtenir les données du spectre audio (non supporté en mobile)
     * @returns {Uint8Array} Données vides
     */
    getSpectrumData() {
        // Retourner des données vides car l'analyse spectrale
        // n'est pas disponible avec HTML5 Audio
        return new Uint8Array(256);
    }
    
    /**
     * Nettoyer les ressources
     */
    cleanup() {
        this.stopTimeUpdate();
        
        Object.values(this.audioElements).forEach(stem => {
            stem.audio.pause();
            stem.audio.src = '';
        });
        
        this.audioElements = {};
        this.mixer.log('Moteur audio mobile nettoyé');
    }
}
