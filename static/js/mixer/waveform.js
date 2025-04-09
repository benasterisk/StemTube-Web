/**
 * StemTubes Mixer - Waveform Renderer
 * Gestion du rendu des formes d'onde pour le mixeur
 */

class WaveformRenderer {
    /**
     * Constructeur du renderer de forme d'onde
     * @param {StemMixer} mixer - Instance principale du mixeur
     */
    constructor(mixer) {
        this.mixer = mixer;
        this.canvasCache = {}; // Cache des canvas pour éviter de redessiner constamment
    }
    
    /**
     * Dessiner la forme d'onde pour un stem
     * @param {string} name - Nom du stem
     */
    drawWaveform(name) {
        const stem = this.mixer.stems[name];
        if (!stem || !stem.waveformData) return;
        
        // Récupérer le conteneur de la forme d'onde
        const waveformContainer = document.querySelector(`.track[data-stem="${name}"] .waveform`);
        if (!waveformContainer) {
            this.mixer.log(`Conteneur de forme d'onde non trouvé pour ${name}`);
            return;
        }
        
        // Créer un canvas s'il n'existe pas déjà
        let canvas = waveformContainer.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            waveformContainer.appendChild(canvas);
        }
        
        // Ajuster la taille du canvas à celle de son conteneur
        canvas.width = waveformContainer.offsetWidth * window.devicePixelRatio;
        canvas.height = waveformContainer.offsetHeight * window.devicePixelRatio;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // Dessiner la forme d'onde
        this.renderWaveformToCanvas(canvas, stem.waveformData);
        
        // Stocker le canvas dans le cache
        this.canvasCache[name] = {
            canvas,
            timestamp: Date.now()
        };
    }
    
    /**
     * Rendre les données de forme d'onde sur un canvas
     * @param {HTMLCanvasElement} canvas - Élément canvas
     * @param {Array<number>} waveformData - Données de forme d'onde
     */
    renderWaveformToCanvas(canvas, waveformData) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        // Effacer le canvas
        ctx.clearRect(0, 0, width, height);
        
        // Calculer les facteurs d'échelle
        const horizontalScale = this.mixer.zoomLevels.horizontal;
        const verticalScale = this.mixer.zoomLevels.vertical;
        
        // Calculer la largeur de la forme d'onde avec le zoom horizontal
        const scaledWidth = width * horizontalScale;
        
        // Calculer le pas entre chaque point
        const step = scaledWidth / waveformData.length;
        
        // Dessiner la grille en arrière-plan
        this.drawGrid(ctx, width, height);
        
        // Dessiner la forme d'onde
        ctx.beginPath();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 1 * window.devicePixelRatio;
        
        // Dessiner la forme d'onde miroir (vers le haut et vers le bas)
        for (let i = 0; i < waveformData.length; i++) {
            // Correction du calcul de x - ne pas diviser par horizontalScale ici
            const x = i * step;
            if (x > width * horizontalScale) break; // Arrêter si on dépasse la largeur du canvas avec zoom
            
            const amplitude = waveformData[i] * verticalScale * height * 0.8; // Appliquer le zoom vertical
            
            // Assurez-vous que le point est visible dans la partie visible du canvas
            if (x < width) {
                ctx.moveTo(x, centerY - amplitude / 2);
                ctx.lineTo(x, centerY + amplitude / 2);
            }
        }
        
        ctx.stroke();
    }
    
    /**
     * Dessiner la grille en arrière-plan
     * @param {CanvasRenderingContext2D} ctx - Contexte de dessin du canvas
     * @param {number} width - Largeur du canvas
     * @param {number} height - Hauteur du canvas
     */
    drawGrid(ctx, width, height) {
        const gridSize = 40 * window.devicePixelRatio;
        
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Lignes verticales
        for (let x = 0; x < width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        
        // Lignes horizontales
        for (let y = 0; y < height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        
        ctx.stroke();
        
        // Ligne centrale plus marquée
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    }
    
    /**
     * Mettre à jour toutes les formes d'onde
     */
    updateAllWaveforms() {
        Object.keys(this.mixer.stems).forEach(stemName => {
            this.drawWaveform(stemName);
        });
    }
    
    /**
     * Mettre à jour la position de la tête de lecture sur toutes les formes d'onde
     * @param {number} position - Position en secondes
     */
    updateWaveformPlayheads(position) {
        Object.keys(this.mixer.stems).forEach(stemName => {
            const playhead = document.querySelector(`.track[data-stem="${stemName}"] .track-playhead`);
            if (!playhead) return;
            
            const waveformContainer = document.querySelector(`.track[data-stem="${stemName}"] .waveform`);
            if (!waveformContainer) return;
            
            // Calculer la position relative
            const positionPercent = (this.mixer.maxDuration > 0) 
                ? (position / this.mixer.maxDuration) * 100 
                : 0;
                
            // Appliquer le zoom horizontal
            const adjustedPercent = positionPercent * this.mixer.zoomLevels.horizontal;
            
            // Limiter la position entre 0% et 100%
            const clampedPercent = Math.max(0, Math.min(adjustedPercent, 100 * this.mixer.zoomLevels.horizontal));
            
            // Mettre à jour la position de la tête de lecture
            playhead.style.left = `${clampedPercent}%`;
        });
    }
    
    /**
     * Redimensionner toutes les formes d'onde
     */
    resizeAllWaveforms() {
        Object.keys(this.mixer.stems).forEach(stemName => {
            const waveformContainer = document.querySelector(`.track[data-stem="${stemName}"] .waveform`);
            if (!waveformContainer) return;
            
            const canvas = waveformContainer.querySelector('canvas');
            if (!canvas) return;
            
            // Ajuster la taille du canvas à celle de son conteneur
            canvas.width = waveformContainer.offsetWidth * window.devicePixelRatio;
            canvas.height = waveformContainer.offsetHeight * window.devicePixelRatio;
            
            // Redessiner la forme d'onde
            this.drawWaveform(stemName);
        });
    }
}
