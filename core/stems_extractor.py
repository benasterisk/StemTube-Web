"""
Stems extractor for StemTubes application.
Handles extraction of audio stems using Demucs models.
"""
import os
import time
import threading
import queue
from typing import Dict, List, Optional, Callable, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import tempfile
import subprocess
import shutil
import platform
import sys

import torch
import torchaudio
if not hasattr(torch, 'Tensor'):  # pragma: no cover - stubbed torch
    class _DummyTensor:
        pass
    torch.Tensor = _DummyTensor
try:
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.separate import load_track
except Exception:  # pragma: no cover - allow tests without demucs
    get_model = apply_model = load_track = None

from .config import get_setting, STEM_MODELS, MODELS_DIR, get_ffmpeg_path, ensure_valid_downloads_directory


class ExtractionStatus(Enum):
    """Enum for extraction status."""
    QUEUED = "queued"
    EXTRACTING = "extracting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ExtractionItem:
    """Class representing an extraction item."""
    audio_path: str
    model_name: str
    output_dir: str
    selected_stems: List[str]
    two_stem_mode: bool = False
    primary_stem: str = "vocals"
    status: ExtractionStatus = ExtractionStatus.QUEUED
    progress: float = 0.0
    extraction_id: str = ""
    error_message: str = ""
    output_paths: Dict[str, str] = None
    zip_path: str = None
    
    def __post_init__(self):
        """Generate a unique extraction ID if not provided and initialize output_paths."""
        if not self.extraction_id:
            self.extraction_id = f"{os.path.basename(self.audio_path)}_{int(time.time())}"
        
        if self.output_paths is None:
            self.output_paths = {}


class StemsExtractor:
    """Manager for handling audio stem extraction."""
    
    def __init__(self):
        """Initialize the stems extractor."""
        self.extraction_queue = queue.Queue()
        self.active_extractions: Dict[str, ExtractionItem] = {}
        self.completed_extractions: Dict[str, ExtractionItem] = {}
        self.failed_extractions: Dict[str, ExtractionItem] = {}
        
        # Check if GPU is available
        self.device = torch.device("cuda" if torch.cuda.is_available() and 
                                  get_setting("use_gpu_for_extraction", True) else "cpu")
        self.using_gpu = self.device.type == "cuda"
        
        # Create models directory if it doesn't exist
        os.makedirs(MODELS_DIR, exist_ok=True)
        
        # Ensure we have a valid downloads directory for default outputs
        self.default_output_dir = ensure_valid_downloads_directory()
        
        # Preloaded models
        self.models = {}
        
        # Start extraction worker thread
        self.worker_thread = threading.Thread(target=self._extraction_worker, daemon=True)
        self.worker_thread.start()
        
        # Callbacks
        self.on_extraction_progress: Optional[Callable[[str, float, str], None]] = None
        self.on_extraction_complete: Optional[Callable[[str], None]] = None
        self.on_extraction_error: Optional[Callable[[str, str], None]] = None
        self.on_extraction_start: Optional[Callable[[str], None]] = None
    
    def add_extraction(self, item: ExtractionItem) -> str:
        """Add an extraction to the queue.
        
        Args:
            item: Extraction item to add.
            
        Returns:
            Extraction ID.
        """
        # Validate output directory
        try:
            os.makedirs(item.output_dir, exist_ok=True)
            # Test write access
            test_file = os.path.join(item.output_dir, ".write_test")
            with open(test_file, 'w') as f:
                f.write("test")
            os.remove(test_file)
        except (IOError, OSError, PermissionError) as e:
            print(f"Warning: Configured output directory is not accessible: {e}")
            print(f"Falling back to default directory: {self.default_output_dir}")
            item.output_dir = self.default_output_dir
        
        self.extraction_queue.put(item)
        return item.extraction_id
    
    def cancel_extraction(self, extraction_id: str) -> bool:
        """Cancel an extraction.
        
        Args:
            extraction_id: ID of the extraction to cancel.
            
        Returns:
            True if the extraction was cancelled, False otherwise.
        """
        # Check if the extraction is active
        if extraction_id in self.active_extractions:
            item = self.active_extractions[extraction_id]
            item.status = ExtractionStatus.CANCELLED
            return True
        
        # Check if the extraction is in the queue
        for _ in range(self.extraction_queue.qsize()):
            item = self.extraction_queue.get()
            if item.extraction_id == extraction_id:
                item.status = ExtractionStatus.CANCELLED
                self.failed_extractions[extraction_id] = item
                return True
            else:
                # Put the item back in the queue
                self.extraction_queue.put(item)
        
        return False
    
    def get_extraction_status(self, extraction_id: str) -> Optional[ExtractionItem]:
        """Get the status of an extraction.
        
        Args:
            extraction_id: ID of the extraction.
            
        Returns:
            Extraction item or None if not found.
        """
        # Check active extractions
        if extraction_id in self.active_extractions:
            return self.active_extractions[extraction_id]
        
        # Check completed extractions
        if extraction_id in self.completed_extractions:
            return self.completed_extractions[extraction_id]
        
        # Check failed extractions
        if extraction_id in self.failed_extractions:
            return self.failed_extractions[extraction_id]
        
        # Check queue
        for _ in range(self.extraction_queue.qsize()):
            item = self.extraction_queue.get()
            self.extraction_queue.put(item)
            if item.extraction_id == extraction_id:
                return item
        
        return None
    
    def get_all_extractions(self) -> Dict[str, List[ExtractionItem]]:
        """Get all extractions.
        
        Returns:
            Dictionary with active, queued, completed, and failed extractions.
        """
        # Get queued extractions
        queued_extractions = []
        for _ in range(self.extraction_queue.qsize()):
            item = self.extraction_queue.get()
            queued_extractions.append(item)
            self.extraction_queue.put(item)
        
        return {
            "active": list(self.active_extractions.values()),
            "queued": queued_extractions,
            "completed": list(self.completed_extractions.values()),
            "failed": list(self.failed_extractions.values())
        }
    
    def get_current_extraction(self) -> Optional[Dict[str, Any]]:
        """Get the currently active extraction.
        
        Returns:
            Dictionary containing extraction information or None if no active extraction.
        """
        # Check if there's an active extraction
        if self.active_extractions:
            # Get the most recent active extraction
            extraction_id = list(self.active_extractions.keys())[0]
            item = self.active_extractions[extraction_id]
            return {
                "extraction_id": extraction_id,
                "progress": item.progress,
                "status": "Extracting stems",
                "model_name": item.model_name,
                "audio_path": item.audio_path
            }
        
        # No active extraction
        return None
        
    def _extraction_worker(self):
        """Worker thread for processing extractions."""
        while True:
            # Check if we can start a new extraction
            if len(self.active_extractions) >= 1 and not self.using_gpu:
                # Only allow one extraction at a time on CPU
                time.sleep(1)
                continue
            
            try:
                # Get the next extraction item
                item = self.extraction_queue.get(block=False)
                
                # Check if the extraction was cancelled
                if item.status == ExtractionStatus.CANCELLED:
                    self.failed_extractions[item.extraction_id] = item
                    self.extraction_queue.task_done()
                    continue
                
                # Start the extraction
                self._start_extraction(item)
                
            except queue.Empty:
                # No extractions in the queue
                time.sleep(1)
    
    def _start_extraction(self, item: ExtractionItem):
        """Start an extraction.
        
        Args:
            item: Extraction item to start.
        """
        # Update status
        item.status = ExtractionStatus.EXTRACTING
        self.active_extractions[item.extraction_id] = item
        
        # Notify extraction start
        if self.on_extraction_start:
            self.on_extraction_start(item.extraction_id)
        
        # Create output directory if it doesn't exist
        os.makedirs(item.output_dir, exist_ok=True)
        
        # Start extraction in a separate thread
        extraction_thread = threading.Thread(
            target=self._extraction_thread,
            args=(item,),
            daemon=True
        )
        extraction_thread.start()
    
    def _on_extraction_progress(self, extraction_id: str, progress: float, status_message: str = None):
        """Handle extraction progress update from worker thread.
        
        Args:
            extraction_id: Extraction ID.
            progress: Extraction progress.
            status_message: Optional status message.
        """
        # Find extraction item
        item = self.active_extractions.get(extraction_id)
        if not item:
            return
        
        # Update progress
        item.progress = progress
        
        # Notify progress listeners
        if self.on_extraction_progress:
            status = status_message if status_message else "Extracting stems"
            self.on_extraction_progress(extraction_id, progress, status)
    
    def _extraction_thread(self, item: ExtractionItem):
        """Thread for extracting stems.
        
        Args:
            item: Extraction item.
        """
        try:
            # Create temporary directory for extraction
            with tempfile.TemporaryDirectory() as temp_dir:
                # Get FFmpeg path for setting environment variables
                ffmpeg_path = get_ffmpeg_path()
                ffmpeg_dir = os.path.dirname(ffmpeg_path)
                
                # Ensure we have the correct ffmpeg path with ffmpeg.exe at the end on Windows
                if platform.system() == "Windows" and not ffmpeg_path.endswith("ffmpeg.exe"):
                    ffmpeg_path = os.path.join(ffmpeg_path, "ffmpeg.exe")
                    
                # Print FFmpeg information before setting up environment
                print(f"FFmpeg path: {ffmpeg_path}")
                print(f"FFmpeg exists: {os.path.exists(ffmpeg_path)}")

                # Configure environment variables for FFmpeg
                env = os.environ.copy()
                
                # Add FFmpeg directory to PATH and set FFMPEG_PATH
                if os.path.exists(ffmpeg_dir):
                    # On Windows, PATH separator is semicolon
                    if platform.system() == "Windows":
                        env["PATH"] = ffmpeg_dir + ";" + env.get("PATH", "")
                    else:
                        # On Unix-like systems, PATH separator is colon
                        env["PATH"] = ffmpeg_dir + ":" + env.get("PATH", "")
                    
                    # Set explicit FFMPEG_PATH environment variable directly to the ffmpeg executable
                    env["FFMPEG_PATH"] = ffmpeg_path
                    print(f"Using FFmpeg at: {ffmpeg_path}")
                    print(f"PATH environment: {env['PATH']}")
                    
                    # Verify FFmpeg is accessible
                    try:
                        result = subprocess.run(
                            [ffmpeg_path, "-version"],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                            env=env,
                            check=False
                        )
                        if result.returncode == 0:
                            print(f"FFmpeg verification successful: {result.stdout.splitlines()[0]}")
                        else:
                            print(f"FFmpeg verification failed: {result.stderr}")
                    except Exception as e:
                        print(f"Error verifying FFmpeg: {e}")
                else:
                    print(f"FFmpeg directory not found: {ffmpeg_dir}")
                
                # Instead of running demucs directly, use our wrapper script
                # to ensure environment variables are correctly set
                cmd = [
                    sys.executable, 
                    os.path.join(os.path.dirname(os.path.abspath(__file__)), "wrap_demucs.py"),
                    ffmpeg_path,  # First arg to wrapper is FFmpeg path
                    '--mp3',                  # Output as MP3
                    '--mp3-bitrate', '320',   # High quality MP3
                    '-v',                     # Verbose output for progress tracking
                    '-n', item.model_name,    # Model name
                    '-o', temp_dir            # Output to temp directory
                ]
                
                # Add device (GPU or CPU)
                if self.device.type == 'cuda':
                    cmd.extend(['-d', 'cuda'])
                else:
                    cmd.extend(['-d', 'cpu'])
                
                # Add two stem mode if needed
                if item.two_stem_mode and item.primary_stem:
                    cmd.extend(['--two-stems', item.primary_stem])
                
                # Add audio file at the end (use the temporary file if available)
                temp_audio_path = None
                try:
                    # Obtenir l'extension du fichier original
                    _, ext = os.path.splitext(item.audio_path)
                    
                    # Créer un fichier temporaire avec un nom simple
                    temp_audio_path = os.path.join(temp_dir, f"input{ext}")
                    
                    # Vérifier que le répertoire source existe
                    if not os.path.exists(item.audio_path):
                        raise FileNotFoundError(f"Source audio file not found: {item.audio_path}")
                    
                    # Copier le fichier audio vers le fichier temporaire
                    print(f"Copying audio file to temporary location: {temp_audio_path}")
                    shutil.copy2(item.audio_path, temp_audio_path)
                    
                    # Utiliser le fichier temporaire pour l'extraction
                    audio_path_for_extraction = temp_audio_path
                    print(f"Using temporary audio file: {audio_path_for_extraction}")
                except Exception as e:
                    print(f"Error creating temporary audio file: {e}")
                    # En cas d'erreur, utiliser le fichier original mais avec des guillemets
                    audio_path_for_extraction = item.audio_path
                    print(f"Falling back to original audio file: {audio_path_for_extraction}")
                
                # Add audio file to the command
                if temp_audio_path and os.path.exists(temp_audio_path):
                    cmd.append(temp_audio_path)
                else:
                    cmd.append(audio_path_for_extraction)
                
                # Print the command for debugging
                print(f"Running command: {' '.join(cmd)}")
                
                # Run demucs.separate as a subprocess
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True,
                    env=env  # Use the environment with FFmpeg configured
                )
                
                # Store output lines for error reporting
                output_lines = []
                
                # Process output to update progress
                for line in iter(process.stdout.readline, ''):
                    output_line = line.strip()
                    print(f"Demucs output: {output_line}")
                    output_lines.append(output_line)
                    
                    # Update progress based on output
                    if '%' in line:
                        try:
                            # Try to parse progress percentage
                            percent_str = line.split('%')[0].split('|')[-1].strip()
                            if ':' in percent_str:
                                percent_str = percent_str.split(':')[-1].strip()
                            # Limiter la progression à 90% pour réserver 10% pour la phase de copie
                            progress_value = min(float(percent_str), 90.0)
                            item.progress = progress_value
                            
                            # Notify progress
                            self._on_extraction_progress(item.extraction_id, item.progress)
                        except (ValueError, IndexError):
                            pass
                
                # Wait for process to complete
                return_code = process.wait()
                
                if return_code != 0:
                    # Join the last 20 lines of output for error reporting
                    error_output = "\n".join(output_lines[-20:]) if output_lines else "No output captured"
                    raise Exception(f"Demucs exited with code {return_code}. Output:\n{error_output}")
                
                # Indiquer que nous sommes maintenant en phase de finalisation
                item.progress = 90.0
                self._on_extraction_progress(item.extraction_id, item.progress, "Finalisation en cours...")
                
                # Copy extracted stems from temp directory to final destination
                model_dir = os.path.join(temp_dir, item.model_name)
                if not os.path.exists(model_dir):
                    raise FileNotFoundError(f"Expected output directory not found: {model_dir}")
                
                # Find track directory (should be only one)
                track_dirs = [d for d in os.listdir(model_dir) if os.path.isdir(os.path.join(model_dir, d))]
                if not track_dirs:
                    raise FileNotFoundError(f"No track directories found in {model_dir}")
                
                track_dir = os.path.join(model_dir, track_dirs[0])
                
                # Create output directory if it doesn't exist
                os.makedirs(item.output_dir, exist_ok=True)
                
                # Copy each stem file to final destination
                stem_files = {}
                total_stems = len(item.selected_stems) if item.selected_stems else 4  # Default to 4 stems if none selected
                for i, stem in enumerate(item.selected_stems if item.selected_stems else ["vocals", "drums", "bass", "other"]):
                    # Mise à jour de la progression pendant la copie des fichiers (de 90% à 99%)
                    progress = 90.0 + (i / total_stems) * 9.0
                    item.progress = progress
                    self._on_extraction_progress(item.extraction_id, progress, f"Copie de {stem}...")
                    
                    # Vérifier si le stem est sélectionné ou si tous les stems sont sélectionnés
                    if not item.selected_stems or stem in item.selected_stems:
                        stem_file_mp3 = os.path.join(track_dir, f"{stem}.mp3")
                        stem_file_wav = os.path.join(track_dir, f"{stem}.wav")
                        
                        if os.path.exists(stem_file_mp3):
                            output_file = os.path.join(item.output_dir, f"{stem}.mp3")
                            shutil.copy2(stem_file_mp3, output_file)
                            stem_files[stem] = output_file
                        elif os.path.exists(stem_file_wav):
                            output_file = os.path.join(item.output_dir, f"{stem}.wav")
                            shutil.copy2(stem_file_wav, output_file)
                            stem_files[stem] = output_file
                
                # Maintenir la progression à 99% pendant la finalisation
                item.progress = 99.0
                self._on_extraction_progress(item.extraction_id, 99.0, "Finalisation...")
                
                # Save stem file paths
                item.output_paths = stem_files
                
                # Create ZIP archive of all stems
                zip_path = self._create_zip_archive(item, os.path.splitext(os.path.basename(item.audio_path))[0])
                if zip_path:
                    item.zip_path = zip_path
                
                # Update status
                item.status = ExtractionStatus.COMPLETED
                item.progress = 100.0
                
                # Envoyer une notification explicite que nous avons atteint 100%
                self._on_extraction_progress(item.extraction_id, 100.0, "Extraction terminée")
                
                # Move from active to completed
                del self.active_extractions[item.extraction_id]
                self.completed_extractions[item.extraction_id] = item
                
                # Notify extraction complete
                if self.on_extraction_complete:
                    self.on_extraction_complete(item.extraction_id)
            
        except Exception as e:
            # Update status
            item.status = ExtractionStatus.FAILED
            item.error_message = str(e)
            
            # Move from active to failed
            del self.active_extractions[item.extraction_id]
            self.failed_extractions[item.extraction_id] = item
            
            # Notify extraction error
            if self.on_extraction_error:
                self.on_extraction_error(item.extraction_id, str(e))
        
        finally:
            # Mark the task as done
            self.extraction_queue.task_done()
    
    def _load_model(self, model_name: str):
        """Load a Demucs model.
        
        Args:
            model_name: Name of the model to load.
            
        Returns:
            Loaded model.
        """
        if model_name in self.models:
            return self.models[model_name]
        
        # Check if model exists in STEM_MODELS
        if model_name not in STEM_MODELS:
            raise ValueError(f"Model '{model_name}' not found")
        
        # Load model
        model = get_model(model_name)
        model.to(self.device)
        
        # Cache model
        self.models[model_name] = model
        
        return model
    
    def _load_audio(self, audio_path: str) -> Tuple[torch.Tensor, int]:
        """Load audio from file.
        
        Args:
            audio_path: Path to audio file.
            
        Returns:
            Tuple of audio tensor and sample rate.
        """
        # Check file extension
        file_ext = os.path.splitext(audio_path)[1].lower()
        
        # If not MP3, convert to MP3 first
        if file_ext != '.mp3':
            try:
                # Get FFmpeg path
                ffmpeg_path = get_ffmpeg_path()
                
                # Create a temporary MP3 file
                temp_mp3_path = os.path.splitext(audio_path)[0] + '_temp.mp3'
                
                # Convert to MP3 using FFmpeg
                import subprocess
                cmd = [
                    ffmpeg_path,
                    '-i', audio_path,
                    '-vn',  # No video
                    '-ar', '44100',  # Sample rate
                    '-ac', '2',  # Stereo
                    '-b:a', '192k',  # Bitrate
                    '-f', 'mp3',  # Format
                    temp_mp3_path
                ]
                
                # Run FFmpeg
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
                # Use the converted file
                audio_path = temp_mp3_path
                
            except Exception as e:
                print(f"Error converting audio file: {e}")
                # Continue with original file if conversion fails
        
        try:
            # First load the audio to get the sample rate
            waveform, sample_rate = torchaudio.load(audio_path)
            
            # Use demucs.separate.load_track with the sample rate

            audio, sr = load_track(audio_path, sample_rate, self.device)

            # Clean up temporary file if it exists
            temp_mp3_path = os.path.splitext(audio_path)[0] + '_temp.mp3'
            if os.path.exists(temp_mp3_path) and temp_mp3_path != audio_path:
                try:
                    os.remove(temp_mp3_path)
                except:
                    pass
                
            return audio, sr
        except Exception as e:
            raise Exception(f"Failed to load audio file: {e}")
    
    def _extract_stems(self, model, audio: torch.Tensor, sr: int, item: ExtractionItem) -> Dict[str, torch.Tensor]:
        """Extract stems from audio.
        
        Args:
            model: Demucs model.
            audio: Audio tensor.
            sr: Sample rate.
            item: Extraction item.
            
        Returns:
            Dictionary of stem name to audio tensor.
        """
        # Get available stems for the model
        model_info = STEM_MODELS.get(item.model_name, {})
        available_stems = model_info.get("stems", [])
        
        # Filter selected stems
        selected_stems = [s for s in item.selected_stems if s in available_stems]
        if not selected_stems:
            selected_stems = available_stems
        
        # Apply model to extract stems
        sources = apply_model(model, audio, self.device, progress=True)
        
        # Create dictionary of stems
        stems = {}
        for i, source_name in enumerate(model.sources):
            if source_name in selected_stems:
                stems[source_name] = sources[:, i]
                
                # Update progress
                progress = (i + 1) / len(model.sources) * 100
                item.progress = progress
                
                # Notify progress
                self._on_extraction_progress(item.extraction_id, progress)
        
        # Handle two-stem mode
        if item.two_stem_mode and item.primary_stem in stems:
            # Create a mix of all other stems
            other_stems = torch.zeros_like(stems[item.primary_stem])
            for name, source in stems.items():
                if name != item.primary_stem:
                    other_stems += source
            
            # Keep only primary stem and "other"
            stems = {
                item.primary_stem: stems[item.primary_stem],
                "other": other_stems
            }
        
        return stems
    
    def _save_stems(self, stems: Dict[str, torch.Tensor], sr: int, item: ExtractionItem):
        """Save stems to files.
        
        Args:
            stems: Dictionary of stem name to audio tensor.
            sr: Sample rate.
            item: Extraction item.
        """
        # Get base filename without extension
        base_name = os.path.splitext(os.path.basename(item.audio_path))[0]
        
        # Ensure output directory exists
        os.makedirs(item.output_dir, exist_ok=True)
        
        # Save each stem
        for stem_name, audio in stems.items():
            # Create output path
            output_path = os.path.join(item.output_dir, f"{base_name}_{stem_name}.wav")
            
            # Save audio
            torchaudio.save(output_path, audio.cpu(), sr)
            
            # Store output path
            item.output_paths[stem_name] = output_path
        
        # Create ZIP archive of all stems
        zip_path = self._create_zip_archive(item, base_name)
        if zip_path:
            item.zip_path = zip_path
    
    def _create_zip_archive(self, item: ExtractionItem, base_name: str) -> str:
        """Create a ZIP archive of extracted stems.
        
        Args:
            item: Extraction item.
            base_name: Base filename without extension.
            
        Returns:
            Path to the created ZIP archive, or None if creation failed.
        """
        try:
            import zipfile
            
            # Create ZIP file path
            zip_path = os.path.join(item.output_dir, f"{base_name}_stems.zip")
            
            # Create ZIP file
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for stem_name, file_path in item.output_paths.items():
                    # Add file to ZIP
                    zipf.write(file_path, os.path.basename(file_path))
            
            print(f"Created ZIP archive: {zip_path}")
            return zip_path
        except Exception as e:
            print(f"Error creating ZIP archive: {e}")
            return None
    
    def is_using_gpu(self) -> bool:
        """Check if GPU is being used for extraction.
        
        Returns:
            True if GPU is being used, False otherwise.
        """
        return self.using_gpu
    
    def set_use_gpu(self, use_gpu: bool):
        """Set whether to use GPU for extraction.
        
        Args:
            use_gpu: Whether to use GPU.
        """
        # Only update if there's a change and GPU is available
        if use_gpu != self.using_gpu and torch.cuda.is_available():
            self.using_gpu = use_gpu
            self.device = torch.device("cuda" if use_gpu else "cpu")
            
            # Clear model cache to reload models on the new device
            self.models.clear()


# Create a singleton instance
_stems_extractor = None

def get_stems_extractor() -> StemsExtractor:
    """Get the stems extractor singleton instance."""
    global _stems_extractor
    if _stems_extractor is None:
        _stems_extractor = StemsExtractor()
    return _stems_extractor
