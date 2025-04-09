# StemTubes Web

A comprehensive web application for discovering, downloading and mixing audio stems from YouTube videos.

![StemTubes Logo](static/img/logo.png)

## Overview

StemTubes Web is a Flask-based application that allows users to:

1. Search for YouTube videos
2. Download videos in audio or video format
3. Extract audio stems (vocals, drums, bass, other) using AI
4. Mix and manipulate extracted stems with a fully-featured mixing console

The application features real-time progress updates, an integrated user authentication system, and a modular architecture.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Database and Authentication](#database-and-authentication)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [API Documentation](#api-documentation)
- [Directory Structure](#directory-structure)
- [Workflow Guide](#workflow-guide)
- [Known Issues](#known-issues)
- [License](#license)

## Features

- **YouTube Integration**: Search and discover YouTube content
- **Download Management**: Queue-based download system with progress tracking
- **Stem Extraction**: AI-powered audio separation using Demucs
- **Interactive Mixer**: Visual waveform display with audio controls
- **User Authentication**: Multi-user support with role-based access
- **Real-time Updates**: WebSocket-based progress indicators
- **Responsive Design**: Modern UI that works on various devices

## Installation

### Prerequisites

- Python 3.8+
- FFmpeg (automatically downloaded if not available)
- Web browser (Chrome/Firefox recommended)

### Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/stemtubes-web.git
cd stemtubes-web
```

2. Install dependencies
```bash
pip install -r requirements.txt
```

3. Start the application
```bash
python app.py
```

4. Access the application at http://localhost:5011

## Database and Authentication

### Database Creation
- The `stemtubes.db` file will be automatically created at first run
- No manual setup required
- The database contains users, preferences, and application data

### Administrator Account
- On first launch, the system automatically creates an administrator account:
  - Username: `administrator`
  - Password: Generated randomly and displayed in the Python console
  - **IMPORTANT**: You MUST note this password from the console output during first launch

### Changing Administrator Password
- After first login, navigate to `/admin` in your browser (e.g., http://localhost:5011/admin)
- Use the user management interface to change the administrator password
- It is highly recommended to change the default password immediately after installation

### Password Reset
If you forget the administrator password:
```bash
python reset_admin_password.py
```
This will generate a new random password and display it in the console.

### User Management
Administrators can add additional users through the Admin panel accessible at `/admin` after logging in.

## Architecture

### Technology Stack

- **Backend**: Python Flask
- **Frontend**: HTML, CSS, JavaScript
- **Real-time Communication**: Flask-SocketIO
- **Authentication**: Flask-Login
- **Database**: SQLite
- **Media Processing**: FFmpeg
- **Audio Separation**: Demucs AI model
- **YouTube Integration**: aiotube library (no API key required)

### High-Level Architecture

```
+------------------+      +------------------+      +------------------+
|                  |      |                  |      |                  |
|  YouTube API     +----->+  Download Queue  +----->+  Extraction      |
|                  |      |                  |      |  Engine          |
+------------------+      +------------------+      +------------------+
          ^                        ^                        |
          |                        |                        |
          |                        |                        v
+------------------+      +------------------+      +------------------+
|                  |      |                  |      |                  |
|  Web Interface   <------+  Flask Backend   <------+  File System     |
|                  |      |                  |      |  Storage         |
+------------------+      +------------------+      +------------------+
          ^                        ^
          |                        |
          |                        |
+------------------+      +------------------+
|                  |      |                  |
|  Client Browser  <------+  WebSockets      |
|                  |      |                  |
+------------------+      +------------------+
```

## Core Components

### 1. Main Application (app.py)

The central component containing all Flask routes, WebSocket handlers, and application logic.

**Key Functions**:
- `index()`: Main application page
- `mixer()`: Audio mixing interface
- `search_videos()`: YouTube search API
- `add_download()`: Queue a video for download
- `add_extraction()`: Process audio into stems
- `export_mix()`: Create mixdown of modified stems

### 2. Download Manager (core/download_manager.py)

Manages the download queue and handles video/audio download operations.

**Key Components**:
- `DownloadManager`: Main class for managing downloads
- `DownloadItem`: Data structure for download tasks
- `DownloadType`: Enum for download types (AUDIO/VIDEO)
- `DownloadStatus`: Enum for download states

### 3. Stems Extractor (core/stems_extractor.py)

Handles the extraction of audio stems from downloaded tracks.

**Key Components**:
- `StemsExtractor`: Main class for extraction operations
- `ExtractionItem`: Data structure for extraction tasks
- `ExtractionStatus`: Enum for extraction states

### 4. YouTube Client (core/aiotube_client.py)

Custom YouTube search and metadata retrieval using aiotube library (no API key required).

**Key Functions**:
- `search_videos()`: Search for videos with query
- `get_video_info()`: Retrieve metadata for specific video
- `extract_video_info()`: Extract detailed info from YouTube pages

### 5. Configuration Manager (core/config.py)

Handles application settings and FFmpeg detection/installation.

**Key Functions**:
- `get_ffmpeg_path()`: Find or download FFmpeg
- `get_app_config()`: Retrieve application settings
- `save_app_config()`: Update configuration

## API Documentation

### REST Endpoints

#### YouTube Operations
- `GET /api/search?q={query}`: Search for videos
- `GET /api/video/{video_id}`: Get video metadata

#### Download Operations
- `POST /api/download`: Add video to download queue
- `GET /api/downloads`: Get download queue status
- `DELETE /api/download/{job_id}`: Cancel download

#### Extraction Operations
- `POST /api/extract`: Add track to extraction queue
- `GET /api/extractions`: Get extraction queue status
- `DELETE /api/extraction/{job_id}`: Cancel extraction

#### Mixer Operations
- `GET /api/tracks`: Get available tracks
- `GET /api/track/{track_id}/stems`: Get stems for track
- `POST /api/export`: Export mixed audio

### WebSocket Events

- `connect`: Client connection established
- `disconnect`: Client disconnected
- `download_progress`: Download progress update
- `extraction_progress`: Extraction progress update
- `download_complete`: Download job finished
- `extraction_complete`: Extraction job finished
- `job_error`: Error in download or extraction job

## Directory Structure

```
stemtubes-web/
├── app.py                 # Main application entry point
├── requirements.txt       # Python dependencies
├── stemtubes.db           # SQLite database (created at first run)
├── reset_admin_password.py# Admin password reset utility
├── static/                # Static assets
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript
│   └── img/               # Images
├── templates/             # HTML templates
│   ├── index.html         # Main page
│   ├── mixer.html         # Stem mixer interface
│   ├── login.html         # Authentication page
│   └── admin.html         # Admin dashboard
└── core/                  # Core modules
    ├── auth_db.py         # Authentication database
    ├── auth_models.py     # User models
    ├── aiotube_client.py  # YouTube client
    ├── download_manager.py# Download management
    ├── stems_extractor.py # AI stem separation
    └── config.py          # Configuration
```

## Workflow Guide

### Typical User Flow

1. **Search**: Enter a YouTube video URL or search query
   - Browse through search results
   - Preview audio with the built-in player

2. **Download**: Select a video to download
   - Choose between audio or video format
   - View real-time progress on the download

3. **Extract**: Choose a downloaded track for stem extraction
   - Monitor the extraction process
   - Get notified when stems are ready

4. **Browse**: Navigate the library of extracted stems
   - Filter by artist, title, or date
   - Preview individual stems

5. **Mix**: Open the mixer to manipulate stems
   - Adjust volume and pan for each stem
   - Mute/solo individual stems
   - Apply zoom to waveforms
   - Play/stop audio playback

6. **Export**: Save the mixed audio to file
   - Choose output format (WAV, MP3, etc.)
   - Download the exported mix

## Known Issues

- Very long videos (>30 minutes) may timeout during stem extraction
- Some YouTube videos with copyright protection may fail to download
- High CPU usage during stem extraction process
- UI responsiveness issues on mobile devices with small screens

## License

2025 StemTubes Web
