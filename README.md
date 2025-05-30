# StemTube Web

A comprehensive web application for discovering, downloading and mixing audio stems from YouTube videos.

![StemTubes Logo](static/img/logo.png)

## Overview

StemTube Web is a Flask-based application that allows users to:

1. Search for YouTube videos
2. Download videos in audio or video format
3. Extract audio stems (vocals, drums, bass, other) using AI
4. Mix and manipulate extracted stems with a fully-featured mixing console

The application features real-time progress updates, an integrated user authentication system, and a modular architecture.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
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
- `get_setting()`: Retrieve configuration settings
- `update_setting()`: Change configuration values
- `ensure_ffmpeg_available()`: Verify/install FFmpeg
- `ensure_valid_downloads_directory()`: Validate save locations

### 6. Authentication System (core/auth_db.py, auth_models.py)

User management and authentication.

**Key Components**:
- `User`: User model with password hashing
- `authenticate_user()`: Validate credentials
- `create_user()`: Register new users
- `change_password()`: Update user credentials

### 7. Frontend Modules

#### 7.1 Main Application (static/js/app.js)

The primary JavaScript module handling UI interactions.

**Key Features**:
- YouTube search functionality
- Download and extraction management
- Tab navigation and UI updates
- WebSocket event handling

#### 7.2 Mixer Engine (static/js/mixer/)

Modular components for the audio mixing interface.

**Key Modules**:
- `timeline.js`: Time display and playhead control
- `waveform.js`: Audio visualization
- `track-controls.js`: Volume, pan, and mute/solo controls
- `audio-engine.js`: Web Audio API integration
- `core.js`: Mixer initialization and coordination

## API Documentation

### Authentication

- `POST /login`: User authentication
- `GET /logout`: User logout

### Search and Discovery

- `GET /api/search`: Search YouTube videos
- `GET /api/video/:id`: Get video information

### Download Management

- `GET /api/downloads`: List all downloads
- `GET /api/download/:id`: Get download status
- `POST /api/download`: Add new download
- `DELETE /api/download/:id`: Cancel download

### Extraction Operations

- `GET /api/extractions`: List all extractions
- `GET /api/extraction/:id`: Get extraction status
- `POST /api/extraction`: Add new extraction
- `DELETE /api/extraction/:id`: Cancel extraction

### Configuration

- `GET /api/config`: Get application settings
- `POST /api/config`: Update settings
- `GET /api/check_ffmpeg`: Verify FFmpeg status
- `POST /api/download_ffmpeg`: Install FFmpeg

### Security Configuration

- **Session-based Authentication**: The application uses Flask-Login for user authentication
- **CSRF Protection**: Disabled for this application to support AJAX requests
- **Session Lifetime**: 24 hours (configurable in app.py)

### File Operations

- `GET /api/download_file/:id`: Download processed file
- `GET /api/waveform`: Generate waveform data
- `POST /api/export_mix`: Create mixdown of modified stems

## Directory Structure

```
stemtubes-web/
│
├── app.py                  # Main Flask application
├── requirements.txt        # Python dependencies
├── stemtubes.db            # SQLite database
│
├── core/                   # Core Python modules
│   ├── __init__.py
│   ├── aiotube_client.py   # YouTube API client
│   ├── auth_db.py          # Authentication database
│   ├── auth_models.py      # User models
│   ├── config.json         # Application settings
│   ├── config.py           # Configuration management
│   ├── demucs_wrapper.py   # AI model wrapper
│   ├── download_manager.py # Download queue system
│   ├── ffmpeg/             # FFmpeg binaries
│   ├── stems_extractor.py  # Audio processing
│   └── wrap_demucs.py      # Demucs integration
│
├── static/                 # Frontend assets
│   ├── css/
│   │   ├── auth.css        # Authentication styles
│   │   ├── mixer/          # Modular mixer styles
│   │   │   └── mixer.css   # Mixer-specific CSS
│   │   └── style.css       # Main application styles
│   │
│   ├── js/
│   │   ├── app.js          # Main application logic
│   │   ├── auth.js         # Authentication handlers
│   │   └── mixer/          # Modular mixer components
│   │       ├── audio-engine.js  # Audio processing
│   │       ├── core.js          # Mixer initialization
│   │       ├── timeline.js      # Time tracking
│   │       ├── track-controls.js # UI controls
│   │       └── waveform.js      # Visualization
│   │
│   └── img/                # Image assets
│
└── templates/              # HTML templates
    ├── admin.html          # Admin interface
    ├── index.html          # Main application
    ├── login.html          # Authentication page
    └── mixer.html          # Stem mixing interface
```

## Workflow Guide

### Typical User Flow

1. **Authentication**: Log in to the application
2. **Search**: Find YouTube videos of interest
3. **Download**: Queue video for download (audio or video)
4. **Extract**: Process downloaded audio into stems
5. **Mix**: Open the mixer to manipulate stems
   - Adjust volume and pan for each stem
   - Mute/solo individual stems
   - Apply zoom to waveforms
   - Play/stop audio playback
6. **Export**: Create a mixdown with current settings

### Administrator Flow

1. **User Management**: Create/edit/delete user accounts
2. **Configuration**: Modify application settings
3. **System Monitoring**: Review logs and performance

## Known Issues

- Heavy CPU usage during extraction process
- User session timeout issues after long periods of inactivity
- Limited mobile device support for the mixer interface

## Potentially Unused Code

The following elements may be candidates for cleanup:

1. Route artifacts from previous implementations:
   - References to old stem mixer in event handlers
   - Some commented code in main app.py file

2. Redundant API endpoints:
   - Duplicate waveform generation functions
   - Legacy download compatibility routes

3. Deprecated error handling:
   - CSRF protection code (currently disabled)
   - Legacy session management code

## License

This software is provided as-is without any guarantees or warranty.

---

© 2025 StemTube Web
