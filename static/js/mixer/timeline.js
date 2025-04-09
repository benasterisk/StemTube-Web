/**
 * StemTubes Mixer - Timeline
 * Gestion de la timeline et du playhead pour le mixeur
 */

class Timeline {
    /**
     * Constructeur de la timeline
     * @param {StemMixer} mixer - Instance principale du mixeur
     */
    constructor(mixer) {
        this.mixer = mixer;
        this.markerInterval = 5; // Intervalle entre les marqueurs de temps en secondes
        this.isDragging = false; // Pour suivre l'état de glissement
        
        // Lier les méthodes pour pouvoir les utiliser comme gestionnaires d'événements
        this.boundMouseMove = this.handleMouseMove.bind(this);
        this.boundMouseUp = this.handleMouseUp.bind(this);
    }
    
    /**
     * Créer les marqueurs de temps sur la timeline
     */
    createTimeMarkers() {
        // Vérifier si l'élément de timeline existe
        if (!this.mixer.elements.timeline) return;
        
        // Récupérer ou créer le conteneur de marqueurs
        let markersContainer = this.mixer.elements.timeline.querySelector('.timeline-markers');
        if (!markersContainer) {
            markersContainer = document.createElement('div');
            markersContainer.className = 'timeline-markers';
            this.mixer.elements.timeline.appendChild(markersContainer);
        } else {
            // Nettoyer les marqueurs existants
            markersContainer.innerHTML = '';
        }
        
        // Vérifier si la durée est disponible
        if (!this.mixer.maxDuration) {
            this.mixer.log('Durée non disponible pour créer les marqueurs');
            return;
        }
        
        // Créer des marqueurs à intervalles réguliers
        const duration = this.mixer.maxDuration;
        
        // Calculer l'intervalle entre les marqueurs principaux
        // Pour les morceaux courts, utiliser des intervalles plus courts
        this.markerInterval = duration <= 60 ? 5 : 
                            duration <= 180 ? 10 : 
                            duration <= 600 ? 30 : 60;
        
        // Calculer les sous-divisions
        const intermediateCount = 2; // Nombre de divisions intermédiaires entre les marqueurs principaux
        const minorCount = 4; // Nombre de divisions mineures entre chaque marqueur intermédiaire
        
        // Calculer les intervalles intermédiaires et mineurs
        const intermediateInterval = this.markerInterval / intermediateCount;
        const minorInterval = intermediateInterval / minorCount;
        
        // Créer tous les marqueurs (principaux, intermédiaires et mineurs)
        for (let time = 0; time <= duration; time += minorInterval) {
            // Déterminer le type de marqueur
            const isMainMarker = Math.abs(time % this.markerInterval) < 0.001;
            const isIntermediateMarker = !isMainMarker && Math.abs(time % intermediateInterval) < 0.001;
            const isMinorMarker = !isMainMarker && !isIntermediateMarker;
            
            // Si ce n'est pas un marqueur (erreur d'arrondi), passer au suivant
            if (time > 0 && !isMainMarker && !isIntermediateMarker && !isMinorMarker) continue;
            
            // Créer le marqueur
            const marker = document.createElement('div');
            marker.className = 'timeline-marker';
            
            // Ajouter la classe appropriée selon le type de marqueur
            if (isIntermediateMarker) marker.classList.add('intermediate');
            if (isMinorMarker) marker.classList.add('minor');
            
            // Calculer la position en pourcentage
            const position = (time / duration) * 100;
            marker.style.left = `${position}%`;
            
            // Formater le temps pour l'affichage (seulement pour les marqueurs principaux et intermédiaires)
            if (!isMinorMarker) {
                marker.textContent = this.mixer.formatTime(time);
            }
            
            // Ajouter le marqueur au conteneur
            markersContainer.appendChild(marker);
        }
        
        this.mixer.log('Marqueurs de timeline créés avec subdivisions');
    }
    
    /**
     * Mettre à jour la position du playhead
     * @param {number} position - Position en secondes
     */
    updatePlayhead(position) {
        // Vérifier si l'élément de playhead existe
        if (!this.mixer.elements.playhead) return;
        
        // Calculer la position en pourcentage
        let positionPercent = 0;
        if (this.mixer.maxDuration > 0) {
            positionPercent = (position / this.mixer.maxDuration) * 100;
        }
        
        // Limiter la position entre 0% et 100%
        const clampedPercent = Math.max(0, Math.min(positionPercent, 100));
        
        // Mettre à jour la position du playhead principal
        this.mixer.elements.playhead.style.left = `${clampedPercent}%`;
        
        // Mettre à jour les playheads des pistes
        this.mixer.waveform.updateWaveformPlayheads(position);
    }
    
    /**
     * Gérer les clics sur la timeline
     * @param {Event} event - Événement de clic
     */
    handleTimelineClick(event) {
        // Cette méthode reste inchangée car elle gère les clics simples
        // Le scratching sera géré par les nouveaux gestionnaires d'événements
        
        // Vérifier si l'élément de timeline existe
        if (!this.mixer.elements.timeline) return;
        
        // Calculer la position relative du clic
        const timelineRect = this.mixer.elements.timeline.getBoundingClientRect();
        const clickPosition = event.clientX - timelineRect.left;
        const clickPercent = clickPosition / timelineRect.width;
        
        // Calculer la position temporelle correspondante
        const newPosition = clickPercent * this.mixer.maxDuration;
        
        // Chercher la nouvelle position
        this.mixer.audioEngine.seekToPosition(newPosition);
        
        this.mixer.log(`Timeline cliquée: position ${newPosition.toFixed(2)}s`);
    }
    
    /**
     * Gérer le début d'un glissement (mousedown) sur la timeline
     * @param {MouseEvent} event - Événement mousedown
     */
    handleMouseDown(event) {
        // Vérifier si l'élément de timeline existe
        if (!this.mixer.elements.timeline) return;
        
        // Activer le mode glissement
        this.isDragging = true;
        
        // Activer le mode scratching dans l'AudioEngine
        this.mixer.audioEngine.startScratchMode();
        
        // Simuler directement un premier scratch à la position du clic
        this.handleMouseMove(event);
        
        // Ajouter les écouteurs d'événements pour suivre le mouvement
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
        
        // Empêcher la sélection de texte pendant le glissement
        event.preventDefault();
    }
    
    /**
     * Gérer le mouvement (mousemove) pendant un glissement
     * @param {MouseEvent} event - Événement mousemove
     */
    handleMouseMove(event) {
        // Vérifier si nous sommes en mode glissement
        if (!this.isDragging) return;
        
        // Calculer la position relative du curseur
        const timelineRect = this.mixer.elements.timeline.getBoundingClientRect();
        const cursorPosition = Math.max(0, Math.min(event.clientX - timelineRect.left, timelineRect.width));
        const positionPercent = cursorPosition / timelineRect.width;
        
        // Calculer la position temporelle correspondante
        const newPosition = positionPercent * this.mixer.maxDuration;
        
        // Appliquer le scratching à cette position
        this.mixer.audioEngine.scratchAt(newPosition);
    }
    
    /**
     * Gérer la fin d'un glissement (mouseup)
     * @param {MouseEvent} event - Événement mouseup
     */
    handleMouseUp(event) {
        // Vérifier si nous étions en mode glissement
        if (!this.isDragging) return;
        
        // Désactiver le mode glissement
        this.isDragging = false;
        
        // Désactiver le mode scratching
        this.mixer.audioEngine.stopScratchMode();
        
        // Calculer la position finale
        const timelineRect = this.mixer.elements.timeline.getBoundingClientRect();
        const finalPosition = Math.max(0, Math.min(event.clientX - timelineRect.left, timelineRect.width));
        const positionPercent = finalPosition / timelineRect.width;
        const finalTime = positionPercent * this.mixer.maxDuration;
        
        // Mettre à jour la position sans démarrer la lecture
        this.updatePlayhead(finalTime);
        this.mixer.currentTime = finalTime;
        this.mixer.updateTimeDisplay();
        
        // Supprimer les écouteurs d'événements
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }
    
    /**
     * Mettre à jour les marqueurs de temps en fonction de la durée
     */
    updateTimeMarkers() {
        // Recréer les marqueurs de temps
        this.createTimeMarkers();
    }
    
    /**
     * Calculer le temps correspondant à une position en pourcentage
     * @param {number} percent - Position en pourcentage
     * @returns {number} Temps en secondes
     */
    percentToTime(percent) {
        return (percent / 100) * this.mixer.maxDuration;
    }
    
    /**
     * Calculer le pourcentage correspondant à un temps
     * @param {number} time - Temps en secondes
     * @returns {number} Position en pourcentage
     */
    timeToPercent(time) {
        if (this.mixer.maxDuration <= 0) return 0;
        return (time / this.mixer.maxDuration) * 100;
    }
}
