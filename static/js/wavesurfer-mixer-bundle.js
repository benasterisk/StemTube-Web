// Import WaveSurfer.js core
import WaveSurfer from '../../wavesurfer.js/dist/wavesurfer.esm.js';
// Import plugins (en version ESM)
import TimelinePlugin from '../../wavesurfer.js/dist/plugins/timeline.esm.js';
import RegionsPlugin from '../../wavesurfer.js/dist/plugins/regions.esm.js';
import MinimapPlugin from '../../wavesurfer.js/dist/plugins/minimap.esm.js';
// Import plugin multitrack depuis les exemples
import MultitrackPlugin from '../../wavesurfer.js/examples/multitrack.js';

// Expose dans window pour usage global dans mixer2.js
window.WaveSurfer = WaveSurfer;
window.WaveSurferTimeline = TimelinePlugin;
window.WaveSurferRegions = RegionsPlugin;
window.WaveSurferMinimap = MinimapPlugin;
window.WaveSurferMultitrack = MultitrackPlugin;
