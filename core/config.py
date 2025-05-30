"""
Configuration module for StemTubes application.
Contains application settings, paths, and constants.
"""
import os
import json
import platform
from pathlib import Path
from dotenv import load_dotenv
import tempfile
import urllib.request
import zipfile
import shutil

# Load environment variables from .env file
load_dotenv()

# Application information
APP_NAME = "StemTubes"
APP_VERSION = "1.0.0"
APP_AUTHOR = "StemTubes Team"

# Paths
APP_DIR = os.path.dirname(os.path.abspath(__file__))
RESOURCES_DIR = os.path.join(APP_DIR, "resources")
# Default downloads directory is now relative to the app directory to make it more portable
DOWNLOADS_DIR = os.path.join(APP_DIR, "downloads")
MODELS_DIR = os.path.join(APP_DIR, "models")
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
FFMPEG_DIR = os.path.join(APP_DIR, "ffmpeg")

# Create necessary directories if they don't exist
os.makedirs(RESOURCES_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(FFMPEG_DIR, exist_ok=True)

# FFmpeg settings
if platform.system() == "Windows":
    FFMPEG_EXECUTABLE = os.path.join(FFMPEG_DIR, "bin", "ffmpeg.exe")
    FFPROBE_EXECUTABLE = os.path.join(FFMPEG_DIR, "bin", "ffprobe.exe")
else:
    FFMPEG_EXECUTABLE = "ffmpeg"
    FFPROBE_EXECUTABLE = "ffprobe"

# YouTube API settings
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

# Default application settings
DEFAULT_SETTINGS = {
    "theme": "dark",  # dark or light
    "downloads_directory": DOWNLOADS_DIR,
    "max_concurrent_downloads": 3,
    "preferred_video_quality": "720p",
    "preferred_audio_quality": "best",
    "use_gpu_for_extraction": True,
    "default_stem_model": "htdemucs",
    "ffmpeg_path": "",
    "auto_check_updates": True
}


def load_config():
    """Load configuration from config file or create default if not exists."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            print(f"Error loading config file. Using defaults.")
            return DEFAULT_SETTINGS.copy()
    else:
        # Create default config file
        save_config(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS.copy()


def save_config(config_data):
    """Save configuration to config file."""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config_data, f, indent=4)
        return True
    except IOError:
        print(f"Error saving config file.")
        return False


# Load configuration
CONFIG = load_config()


def get_setting(key, default=None):
    """Get a setting value from config."""
    return CONFIG.get(key, default)


def update_setting(key, value):
    """Update a setting value and save config."""
    CONFIG[key] = value
    save_config(CONFIG)
    return True


def ensure_valid_downloads_directory():
    """Ensures that the configured downloads directory is valid and accessible.
    
    If the configured directory is not valid or accessible, fall back to the default.
    
    Returns:
        str: The valid downloads directory path
    """
    downloads_dir = get_setting("downloads_directory", DOWNLOADS_DIR)
    
    # Test if the directory exists or can be created
    try:
        os.makedirs(downloads_dir, exist_ok=True)
        # Try to write a small test file to verify permissions
        test_file_path = os.path.join(downloads_dir, ".write_test")
        with open(test_file_path, 'w') as f:
            f.write("test")
        os.remove(test_file_path)
        return downloads_dir
    except (IOError, OSError, PermissionError) as e:
        print(f"Warning: Configured downloads directory is not accessible: {e}")
        print(f"Falling back to default downloads directory: {DOWNLOADS_DIR}")
        # Update the setting to the default
        update_setting("downloads_directory", DOWNLOADS_DIR)
        return DOWNLOADS_DIR


# FFmpeg path management
def get_ffmpeg_path():
    """Get FFmpeg executable path."""
    custom_path = get_setting("ffmpeg_path")
    if custom_path and os.path.exists(custom_path):
        return custom_path
    elif os.path.exists(FFMPEG_EXECUTABLE):
        return FFMPEG_EXECUTABLE
    else:
        # Try to find in system PATH
        return "ffmpeg"


def get_ffprobe_path():
    """Get FFprobe executable path."""
    custom_path = get_setting("ffmpeg_path")
    if custom_path:
        # If custom path is a directory, append ffprobe executable
        if os.path.isdir(custom_path):
            probe_path = os.path.join(custom_path, "ffprobe.exe" if platform.system() == "Windows" else "ffprobe")
            if os.path.exists(probe_path):
                return probe_path
        # If custom path points to ffmpeg executable, try to find ffprobe in same directory
        elif os.path.isfile(custom_path) and "ffmpeg" in os.path.basename(custom_path).lower():
            probe_path = os.path.join(os.path.dirname(custom_path), 
                                     "ffprobe.exe" if platform.system() == "Windows" else "ffprobe")
            if os.path.exists(probe_path):
                return probe_path
    
    # Use bundled ffprobe if available
    if os.path.exists(FFPROBE_EXECUTABLE):
        return FFPROBE_EXECUTABLE
    
    # Default to system PATH
    return "ffprobe"


def download_ffmpeg():
    """Download and set up FFmpeg if not already available.
    
    Returns:
        Tuple of (success, message)
    """
    # Check if FFmpeg is already available
    if os.path.exists(FFMPEG_EXECUTABLE) and os.path.exists(FFPROBE_EXECUTABLE):
        return True, "FFmpeg already installed"
    
    try:
        # Download FFmpeg based on platform
        if platform.system() == "Windows":
            ffmpeg_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
            print(f"Downloading FFmpeg from {ffmpeg_url}...")
            
            # Download to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_file:
                temp_path = temp_file.name
                
            urllib.request.urlretrieve(ffmpeg_url, temp_path)
            
            # Extract the zip file
            with zipfile.ZipFile(temp_path, 'r') as zip_ref:
                # Extract to a temporary directory first
                temp_extract_dir = tempfile.mkdtemp()
                zip_ref.extractall(temp_extract_dir)
                
                # Find the extracted directory (should be the only directory)
                extracted_dirs = [d for d in os.listdir(temp_extract_dir) if os.path.isdir(os.path.join(temp_extract_dir, d))]
                if not extracted_dirs:
                    return False, "Failed to extract FFmpeg"
                
                # Move contents to FFmpeg directory
                extracted_dir = os.path.join(temp_extract_dir, extracted_dirs[0])
                for item in os.listdir(extracted_dir):
                    src = os.path.join(extracted_dir, item)
                    dst = os.path.join(FFMPEG_DIR, item)
                    if os.path.exists(dst):
                        if os.path.isdir(dst):
                            shutil.rmtree(dst)
                        else:
                            os.remove(dst)
                    shutil.move(src, dst)
                
                # Clean up
                shutil.rmtree(temp_extract_dir)
                os.remove(temp_path)
            
            # Update settings
            update_setting("ffmpeg_path", os.path.join(FFMPEG_DIR, "bin"))
            
            return True, "FFmpeg downloaded and installed successfully"
        else:
            # For non-Windows platforms, suggest manual installation
            return False, "Automatic FFmpeg installation is only supported on Windows. Please install FFmpeg manually."
    
    except Exception as e:
        return False, f"Error downloading FFmpeg: {str(e)}"


def ensure_ffmpeg_available():
    """Ensure FFmpeg is available, downloading it if necessary.
    
    Returns:
        True if FFmpeg is available, False otherwise.
    """
    # 1. Check if FFmpeg is available in the system PATH
    try:
        import subprocess
        import shutil
        
        # Try to get FFmpeg path from system using 'where' command on Windows or 'which' on Unix
        if platform.system() == "Windows":
            result = subprocess.run(["where", "ffmpeg"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0 and result.stdout.strip():
                # Get the first path from the output (in case there are multiple)
                ffmpeg_system_path = result.stdout.strip().split('\n')[0].strip()
                
                # Get the directory containing ffmpeg.exe
                ffmpeg_dir = os.path.dirname(ffmpeg_system_path)
                
                # Verify ffprobe is also available in the same directory
                ffprobe_path = os.path.join(ffmpeg_dir, "ffprobe.exe")
                if os.path.exists(ffprobe_path):
                    # Update the config with the found path
                    update_setting("ffmpeg_path", ffmpeg_dir)
                    print(f"Found system FFmpeg at: {ffmpeg_dir}")
                    return True
        else:
            # For non-Windows platforms, use 'which'
            result = subprocess.run(["which", "ffmpeg"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0 and result.stdout.strip():
                ffmpeg_system_path = result.stdout.strip()
                ffmpeg_dir = os.path.dirname(ffmpeg_system_path)
                
                # Verify ffprobe is also available in the same directory
                ffprobe_path = os.path.join(ffmpeg_dir, "ffprobe")
                if os.path.exists(ffprobe_path):
                    # Update the config with the found path
                    update_setting("ffmpeg_path", ffmpeg_dir)
                    print(f"Found system FFmpeg at: {ffmpeg_dir}")
                    return True
    except Exception as e:
        print(f"Error checking system FFmpeg: {e}")
    
    # 2. Check if we have a bundled version in the application directory
    if os.path.exists(FFMPEG_EXECUTABLE) and os.path.exists(FFPROBE_EXECUTABLE):
        ffmpeg_dir = os.path.dirname(FFMPEG_EXECUTABLE)
        update_setting("ffmpeg_path", ffmpeg_dir)
        print(f"Using bundled FFmpeg at: {ffmpeg_dir}")
        return True
    
    # 3. Try to download FFmpeg
    print("FFmpeg not found in system or bundled. Attempting to download...")
    success, message = download_ffmpeg()
    print(message)
    return success


# Stem extraction models
STEM_MODELS = {
    "htdemucs": {
        "name": "HTDemucs (4 stems)",
        "stems": ["vocals", "drums", "bass", "other"],
        "path": os.path.join(MODELS_DIR, "htdemucs"),
        "url": "https://dl.fbaipublicfiles.com/demucs/v4_htdemucs.th",
        "description": "High quality 4-stem separation (vocals, drums, bass, other)"
    },
    "htdemucs_6s": {
        "name": "HTDemucs 6-stem",
        "stems": ["vocals", "drums", "bass", "guitar", "piano", "other"],
        "path": os.path.join(MODELS_DIR, "htdemucs_6s"),
        "url": "https://dl.fbaipublicfiles.com/demucs/v4_htdemucs_6s.th",
        "description": "6-stem separation (vocals, drums, bass, guitar, piano, other)"
    },
    "htdemucs_ft": {
        "name": "HTDemucs Fine-Tuned",
        "stems": ["vocals", "drums", "bass", "other"],
        "path": os.path.join(MODELS_DIR, "htdemucs_ft"),
        "url": "https://dl.fbaipublicfiles.com/demucs/v4_htdemucs_ft.th",
        "description": "Fine-tuned 4-stem separation with better quality"
    }
}
