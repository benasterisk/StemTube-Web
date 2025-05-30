#!/usr/bin/env python
"""
Wrapper script for Demucs that ensures FFmpeg is properly configured.
"""
import os
import sys
import subprocess

# Ajouter le répertoire parent au chemin d'importation pour pouvoir importer core.config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the get_ffmpeg_path function from config
from core.config import get_ffmpeg_path

# Get the path to FFmpeg using the config function
ffmpeg_path = get_ffmpeg_path()

# Check if FFmpeg exists
if not os.path.exists(ffmpeg_path):
    print(f"Error: FFmpeg not found at {ffmpeg_path}")
    sys.exit(1)

# Print FFmpeg path for debugging
print(f"Using FFmpeg at: {ffmpeg_path}")

# Add FFmpeg directory to PATH
ffmpeg_dir = os.path.dirname(ffmpeg_path)
os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

# Set explicit FFMPEG_PATH environment variable
os.environ["FFMPEG_PATH"] = ffmpeg_path

# Add to Python path if needed
try:
    import torch.hub
    torch.hub.set_dir(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                               "models"))
except ImportError:
    pass

# Get the original command for Demucs
demucs_args = sys.argv[1:]

# Add Python executable and module path
full_cmd = [sys.executable, "-m", "demucs.separate"]

# Ajouter explicitement l'option --ffmpeg pour spécifier le chemin de FFmpeg
# Vérifier si --ffmpeg est déjà dans les arguments
if not any(arg.startswith("--ffmpeg") for arg in demucs_args):
    full_cmd.extend(["--ffmpeg", ffmpeg_path])

# Ajouter les arguments originaux
full_cmd.extend(demucs_args)

# Print the full command for debugging
print(f"Running command: {' '.join(full_cmd)}")

# Run Demucs with the FFmpeg path configured
process = subprocess.run(full_cmd)

# Return the same exit code
sys.exit(process.returncode)
