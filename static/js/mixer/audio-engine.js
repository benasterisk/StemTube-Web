/**
 * StemTubes Mixer - Audio Engine
 * Gestion de l'audio pour le mixeur : chargement, lecture, pause, etc.
 */

class AudioEngine {
    /**
     * Constructeur du moteur audio
     * @param {StemMixer} mixer - Instance principale du mixeur
     */
    constructor(mixer) {
        this.mixer = mixer;
        this.audioContext = null;
        this.masterGainNode = null;
        this.analyserNode = null;
        this.startTime = 0;
        this.animationFrameId = null;
        this.isPausing = false;
        this.isScratchMode = false;  // Nouvel état pour le mode scratching
        this.scratchBufferDuration = 0.1;  // Durée de chaque segment de scratch en secondes
    }
    
    /**
     * Initialiser le contexte audio
     */
    async initAudioContext() {
        try {
            // Créer le contexte audio
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Créer le nœud de gain principal
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Créer un nœud d'analyseur pour les visualisations
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048;
            this.masterGainNode.connect(this.analyserNode);
            
            this.mixer.log('Contexte audio initialisé');
            return true;
        } catch (error) {
            this.mixer.log(`Erreur lors de l'initialisation du contexte audio: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Charger un stem audio
     * @param {string} name - Nom du stem
     * @param {string} url - URL du fichier audio
     */
    async loadStem(name, url) {
        try {
            this.mixer.log(`Chargement du stem ${name} depuis ${url}`);
            
            // Créer un élément de piste pour ce stem
            this.mixer.trackControls.createTrackElement(name);
            
            // Initialiser l'objet stem
            this.mixer.stems[name] = {
                name,
                url,
                buffer: null,
                source: null,
                gainNode: null,
                panNode: null,
                volume: 1,
                pan: 0,
                muted: false,
                solo: false,
                active: true,
                waveformData: null
            };
            
            // Récupérer le fichier audio
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    this.mixer.log(`Le stem ${name} n'existe pas (404)`);
                    return;
                }
                throw new Error(`Erreur lors du chargement du stem ${name}: ${response.status}`);
            }
            
            // Convertir la réponse en ArrayBuffer
            const arrayBuffer = await response.arrayBuffer();
            
            // Décoder l'audio
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Stocker le buffer audio
            this.mixer.stems[name].buffer = audioBuffer;
            
            // Extraire les données de forme d'onde
            await this.extractWaveformData(name);
            
            this.mixer.log(`Stem ${name} chargé avec succès`);
        } catch (error) {
            this.mixer.log(`Erreur lors du chargement du stem ${name}: ${error.message}`);
        }
    }
    
    /**
     * Extraire les données de forme d'onde d'un stem
     * @param {string} name - Nom du stem
     */
    async extractWaveformData(name) {
        const stem = this.mixer.stems[name];
        if (!stem || !stem.buffer) return;
        
        // Obtenir les données audio du buffer
        const audioBuffer = stem.buffer;
        const channelData = audioBuffer.getChannelData(0); // Utiliser le premier canal pour la forme d'onde
        
        // Réduire la résolution pour de meilleures performances
        const numberOfSamples = Math.min(audioBuffer.length, 2000);
        const blockSize = Math.floor(channelData.length / numberOfSamples);
        const waveformData = [];
        
        for (let i = 0; i < numberOfSamples; i++) {
            const blockStart = i * blockSize;
            let blockSum = 0;
            
            // Calculer la valeur moyenne absolue pour ce bloc
            for (let j = 0; j < blockSize && (blockStart + j) < channelData.length; j++) {
                blockSum += Math.abs(channelData[blockStart + j]);
            }
            
            // Stocker la valeur moyenne
            waveformData.push(blockSum / blockSize);
        }
        
        // Stocker les données de forme d'onde
        stem.waveformData = waveformData;
        
        // Dessiner la forme d'onde
        this.mixer.waveform.drawWaveform(name);
    }
    
    /**
     * Configurer les nœuds audio pour un stem
     * @param {string} name - Nom du stem
     */
    setupAudioNodes(name) {
        const stem = this.mixer.stems[name];
        if (!stem || !stem.buffer) return null;
        
        // Créer la source audio
        stem.source = this.audioContext.createBufferSource();
        stem.source.buffer = stem.buffer;
        
        // Créer le nœud de gain
        stem.gainNode = this.audioContext.createGain();
        stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
        
        // Créer le nœud de panoramique
        stem.panNode = this.audioContext.createStereoPanner();
        stem.panNode.pan.value = stem.pan;
        
        // Connecter les nœuds
        stem.source.connect(stem.gainNode);
        stem.gainNode.connect(stem.panNode);
        stem.panNode.connect(this.masterGainNode);
        
        // Configurer l'événement de fin de lecture
        stem.source.onended = () => {
            this.handleStemEnded(name);
        };
        
        return stem.source;
    }
    
    /**
     * Gérer la fin de lecture d'un stem
     * @param {string} name - Nom du stem
     */
    handleStemEnded(name) {
        this.mixer.log(`Lecture terminée pour ${name}`);
        
        // Nettoyer la source
        this.mixer.stems[name].source = null;
        
        // Si nous sommes en train de mettre en pause, ne pas réinitialiser la position
        if (this.isPausing) {
            return;
        }
        
        // Vérifier si toutes les sources actives ont terminé leur lecture
        const allEnded = Object.values(this.mixer.stems).every(stem => 
            !stem.active || !stem.source
        );
        
        if (allEnded) {
            this.mixer.log('Toutes les pistes ont terminé leur lecture');
            this.mixer.isPlaying = false;
            this.mixer.currentTime = 0;
            this.mixer.updatePlayPauseButton();
            this.stopPlaybackAnimation();
            this.mixer.timeline.updatePlayhead(0);
        }
    }
    
    /**
     * Démarrer la lecture
     */
    play() {
        // Réinitialiser l'état du contexte audio si nécessaire
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Mettre à jour le temps de départ pour synchroniser le temps écoulé avec la position actuelle exacte
        this.startTime = this.audioContext.currentTime - this.mixer.currentTime;
        
        // Effectuer un nettoyage explicite des sources existantes avant d'en créer de nouvelles
        Object.values(this.mixer.stems).forEach(stem => {
            if (stem.source) {
                try {
                    // Supprimer l'événement onended avant d'arrêter la source
                    stem.source.onended = null;
                    stem.source.stop();
                } catch (e) {
                    // Ignorer les erreurs si la source est déjà arrêtée
                }
                stem.source = null;
            }
        });
        
        // Log pour débogage
        this.mixer.log(`Démarrage de la lecture à partir de la position ${this.mixer.currentTime.toFixed(2)}s`);
        
        // Démarrer la lecture de chaque stem actif
        Object.entries(this.mixer.stems).forEach(([name, stem]) => {
            if (stem.active && stem.buffer) {
                // Créer de nouveaux nœuds audio pour éviter les problèmes de réutilisation
                this.setupAudioNodes(name);
                
                // Démarrer la lecture à la position actuelle précise
                if (stem.source) {
                    try {
                        // Utiliser un offset exact pour commencer à la bonne position
                        const offset = Math.min(this.mixer.currentTime, stem.buffer.duration);
                        stem.source.start(0, offset);
                        this.mixer.log(`Lecture du stem ${name} à partir de la position ${offset.toFixed(2)}s`);
                    } catch (e) {
                        this.mixer.log(`Erreur lors du démarrage du stem ${name}: ${e.message}`);
                    }
                }
            }
        });
        
        // Mettre à jour l'état de lecture
        this.mixer.isPlaying = true;
        
        // Démarrer l'animation de la tête de lecture
        this.startPlaybackAnimation();
    }
    
    /**
     * Mettre en pause la lecture
     */
    pause() {
        // Sauvegarder la position actuelle avant d'arrêter les sources
        if (this.mixer.isPlaying) {
            this.mixer.currentTime = this.audioContext.currentTime - this.startTime;
            this.mixer.log(`Pause à la position: ${this.mixer.currentTime.toFixed(2)}s`);
        }
        
        // Arrêter la lecture de chaque stem en désactivant d'abord les événements onended
        Object.entries(this.mixer.stems).forEach(([name, stem]) => {
            if (stem.source) {
                // Supprimer l'événement onended pour éviter le déclenchement lors de la pause
                stem.source.onended = null;
                
                try {
                    stem.source.stop();
                } catch (e) {
                    // Ignorer les erreurs si la source est déjà arrêtée
                }
                
                stem.source = null;
            }
        });
        
        // Mettre à jour l'état de lecture
        this.mixer.isPlaying = false;
        
        // Arrêter l'animation de la tête de lecture
        this.stopPlaybackAnimation();
        
        // Mettre à jour l'affichage du temps et la position du playhead pour refléter la position actuelle
        this.mixer.updateTimeDisplay();
        this.mixer.timeline.updatePlayhead(this.mixer.currentTime);
    }
    
    /**
     * Arrêter la lecture
     */
    stop() {
        // Arrêter la lecture de chaque stem
        Object.values(this.mixer.stems).forEach(stem => {
            if (stem.source) {
                // On peut garder onended ici car on veut vraiment réinitialiser
                try {
                    stem.source.stop();
                } catch (e) {
                    // Ignorer les erreurs si la source est déjà arrêtée
                }
                
                stem.source = null;
            }
        });
        
        // Mettre à jour l'état de lecture
        this.mixer.isPlaying = false;
        
        // Réinitialiser la position actuelle
        this.mixer.currentTime = 0;
        
        // Arrêter l'animation de la tête de lecture
        this.stopPlaybackAnimation();
        
        // Réinitialiser la position de la tête de lecture
        this.mixer.timeline.updatePlayhead(0);
        
        // Mettre à jour l'affichage du temps
        this.mixer.updateTimeDisplay();
        
        this.mixer.log('Lecture arrêtée et position réinitialisée à 0');
    }
    
    /**
     * Démarrer l'animation de la tête de lecture
     */
    startPlaybackAnimation() {
        // Arrêter l'animation existante si nécessaire
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Fonction d'animation
        const animate = () => {
            this.updatePlaybackPositions();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        // Démarrer l'animation
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    /**
     * Arrêter l'animation de la tête de lecture
     */
    stopPlaybackAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Mettre à jour les positions de lecture
     */
    updatePlaybackPositions() {
        if (!this.mixer.isPlaying) return;
        
        // Calculer la position actuelle
        this.mixer.currentTime = this.audioContext.currentTime - this.startTime;
        
        // Limiter à la durée maximale
        if (this.mixer.currentTime >= this.mixer.maxDuration) {
            this.stop();
            return;
        }
        
        // Mettre à jour la position des têtes de lecture
        this.mixer.timeline.updatePlayhead(this.mixer.currentTime);
        
        // Mettre à jour l'affichage du temps
        this.mixer.updateTimeDisplay();
    }
    
    /**
     * Chercher une position spécifique dans l'audio
     * @param {number} position - Position en secondes
     */
    seekToPosition(position) {
        // Limiter la position entre 0 et la durée maximale
        const newPosition = Math.max(0, Math.min(position, this.mixer.maxDuration));
        
        this.mixer.log(`Navigation vers la position ${newPosition.toFixed(2)}s`);
        
        // Stocker la position pour l'utiliser après le redémarrage
        const targetPosition = newPosition;
        
        // Arrêter toutes les sources audio actuelles en désactivant d'abord les événements onended
        Object.values(this.mixer.stems).forEach(stem => {
            if (stem.source) {
                // Supprimer l'événement onended pour éviter le déclenchement lors de la navigation
                stem.source.onended = null;
                
                try {
                    stem.source.stop();
                } catch (e) {
                    // Ignorer les erreurs si la source est déjà arrêtée
                }
                
                stem.source = null;
            }
        });
        
        // Mettre à jour la position des têtes de lecture
        this.mixer.timeline.updatePlayhead(newPosition);
        
        // Mettre à jour l'affichage du temps
        this.mixer.updateTimeDisplay();
        
        // Redémarrer la lecture si nécessaire
        if (this.mixer.isPlaying) {
            // Mettre à jour currentTime JUSTE AVANT de démarrer la lecture
            // pour s'assurer que la valeur n'est pas écrasée par des événements asynchrones
            setTimeout(() => {
                // Mettre à jour currentTime immédiatement avant de jouer pour éviter toute interférence
                this.mixer.currentTime = targetPosition;
                this.play();
            }, 20);
        } else {
            // Si nous ne sommes pas en lecture, mettre à jour la position immédiatement
            this.mixer.currentTime = targetPosition;
        }
    }
    
    /**
     * Mettre à jour les états solo/mute
     */
    updateSoloMuteStates() {
        // Vérifier si au moins une piste est en solo
        const hasSolo = Object.values(this.mixer.stems).some(stem => stem.solo);
        
        // Mettre à jour le gain de chaque piste en fonction de son état
        Object.entries(this.mixer.stems).forEach(([name, stem]) => {
            if (!stem.gainNode) return;
            
            // Si une piste est en solo, toutes les autres sont muettes sauf si elles sont aussi en solo
            if (hasSolo) {
                stem.gainNode.gain.value = (stem.solo) ? stem.volume : 0;
            } else {
                // Sinon, appliquer l'état mute normal
                stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
            }
            
            // Mettre à jour l'indicateur d'état actif
            this.mixer.trackControls.updateTrackStatus(name, hasSolo ? stem.solo : !stem.muted);
        });
    }
    
    /**
     * Permet de "scratcher" l'audio à une position spécifique pendant un glissement
     * @param {number} position - Position en secondes
     */
    scratchAt(position) {
        // Limiter la position entre 0 et la durée maximale
        const newPosition = Math.max(0, Math.min(position, this.mixer.maxDuration));
        
        // Mettre à jour la position des têtes de lecture
        this.mixer.timeline.updatePlayhead(newPosition);
        
        // Mettre à jour la position actuelle
        this.mixer.currentTime = newPosition;
        
        // Mettre à jour l'affichage du temps
        this.mixer.updateTimeDisplay();
        
        // Arrêter toutes les sources audio actuelles
        Object.values(this.mixer.stems).forEach(stem => {
            if (stem.source) {
                // Supprimer l'événement onended
                stem.source.onended = null;
                
                try {
                    stem.source.stop();
                } catch (e) {
                    // Ignorer les erreurs si la source est déjà arrêtée
                }
                
                stem.source = null;
            }
        });
        
        // Jouer un court segment audio à cette position
        this.playScratchSegment(newPosition);
        
        return newPosition;
    }
    
    /**
     * Joue un court segment audio pour l'effet de scratching
     * @param {number} position - Position en secondes
     */
    playScratchSegment(position) {
        Object.entries(this.mixer.stems).forEach(([name, stem]) => {
            if (stem.active && stem.buffer) {
                // Créer de nouveaux nœuds audio
                this.setupAudioNodes(name);
                
                if (stem.source) {
                    try {
                        // Calculer l'offset en fonction de la position
                        const offset = Math.min(position, stem.buffer.duration);
                        
                        // Définir quand la source doit s'arrêter (durée très courte)
                        stem.source.onended = null; // Éviter les rappels d'événements
                        
                        // Démarrer la lecture avec un offset et une durée fixe
                        stem.source.start(0, offset, this.scratchBufferDuration);
                        
                        // Arrêter la source après une courte durée
                        setTimeout(() => {
                            if (stem.source) {
                                stem.source.onended = null;
                                try {
                                    stem.source.stop();
                                } catch (e) {
                                    // Ignorer les erreurs
                                }
                            }
                        }, this.scratchBufferDuration * 900); // Légèrement plus court que la durée réelle
                        
                    } catch (e) {
                        this.mixer.log(`Erreur lors du scratching du stem ${name}: ${e.message}`);
                    }
                }
            }
        });
    }
    
    /**
     * Démarrer le mode scratching
     */
    startScratchMode() {
        this.isScratchMode = true;
        
        // Arrêter la lecture normale si elle est en cours
        if (this.mixer.isPlaying) {
            this.mixer.isPlaying = false;
            this.stopPlaybackAnimation();
            
            // Arrêter toutes les sources audio actuelles
            Object.values(this.mixer.stems).forEach(stem => {
                if (stem.source) {
                    stem.source.onended = null;
                    try {
                        stem.source.stop();
                    } catch (e) {
                        // Ignorer les erreurs
                    }
                    stem.source = null;
                }
            });
        }
        
        this.mixer.log('Mode scratching activé');
    }
    
    /**
     * Arrêter le mode scratching
     */
    stopScratchMode() {
        this.isScratchMode = false;
        this.mixer.log('Mode scratching désactivé');
    }
}
