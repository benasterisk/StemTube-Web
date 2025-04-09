"""
Main Flask application for StemTubes Web.
Provides a web interface for YouTube browsing, downloading, and stem extraction.
"""
import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for, flash
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
import subprocess
import sys
import uuid
import time
import tempfile
import shutil
import numpy as np
import random
from flask import Response
from datetime import datetime
from functools import wraps

# Import core modules
from core.aiotube_client import get_aiotube_client
from core.download_manager import DownloadManager, DownloadItem, DownloadType, DownloadStatus
from core.stems_extractor import StemsExtractor, ExtractionItem, ExtractionStatus
from core.config import get_setting, update_setting, get_ffmpeg_path, get_ffprobe_path, download_ffmpeg, ensure_ffmpeg_available, ensure_valid_downloads_directory
from core.auth_db import init_db, authenticate_user, get_user_by_id, get_user_by_username, create_user, update_user, change_password, delete_user, get_all_users
from core.auth_models import User

# Ensure FFmpeg is available
print("Checking for FFmpeg...")
if not ensure_ffmpeg_available():
    print("ERROR: FFmpeg is required but could not be installed automatically.")
    print("Please install FFmpeg manually and try again.")
    exit(1)
print("FFmpeg is available.")

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'stemtubes-web-secret-key'
# Enable session management
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # Session lasts for 1 day
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')

# Security settings - CSRF protection disabled for this application
# Session-based authentication provides sufficient security

# Ensure session directory exists
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

# Initialize session extension
from flask_session import Session
sess = Session(app)

# CSRF protection is disabled for this application

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'error'

@login_manager.user_loader
def load_user(user_id):
    """Load a user from the database by ID."""
    user_data = get_user_by_id(user_id)
    if user_data:
        return User(user_data)
    return None

# Initialize database
init_db()

socketio = SocketIO(app, 
                   cors_allowed_origins="*", 
                   logger=True, 
                   engineio_logger=True,
                   async_mode='threading',
                   manage_session=False)  # Let Flask-Session handle the sessions

# Initialize global YouTube client (shared across sessions is fine)
aiotube_client = get_aiotube_client()

# Admin required decorator
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash('You do not have permission to access this page.', 'error')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

# API login required decorator
def api_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Authentication required',
                'redirect': url_for('login')
            }), 401
        return f(*args, **kwargs)
    return decorated_function

# Note: CSRF protection is disabled for this application since it has session-based authentication

# Create a session manager to handle per-user instances
class SessionManager:
    def __init__(self):
        self.download_managers = {}
        self.stems_extractors = {}
        
    def get_download_manager(self, session_id):
        """Get or create a download manager for a specific session"""
        if session_id not in self.download_managers:
            print(f"Creating new download manager for session {session_id}")
            dm = DownloadManager()
            dm.on_download_progress = lambda download_id, progress, speed, eta: on_download_progress(session_id, download_id, progress, speed, eta)
            dm.on_download_complete = lambda download_id, title, file_path: on_download_complete(session_id, download_id, title, file_path)
            dm.on_download_error = lambda download_id, error_message: on_download_error(session_id, download_id, error_message)
            self.download_managers[session_id] = dm
        return self.download_managers[session_id]
    
    def get_stems_extractor(self, session_id):
        """Get or create a stems extractor for a specific session"""
        if session_id not in self.stems_extractors:
            print(f"Creating new stems extractor for session {session_id}")
            se = StemsExtractor()
            se.on_extraction_progress = lambda extraction_id, progress, status_message: on_extraction_progress(session_id, extraction_id, progress, status_message)
            se.on_extraction_complete = lambda extraction_id: on_extraction_complete(session_id, extraction_id)
            se.on_extraction_error = lambda extraction_id, error_message: on_extraction_error(session_id, extraction_id, error_message)
            self.stems_extractors[session_id] = se
        return self.stems_extractors[session_id]
    
    def cleanup_session(self, session_id):
        """Clean up resources for a session when it ends"""
        if session_id in self.download_managers:
            print(f"Cleaning up download manager for session {session_id}")
            # No specific cleanup needed right now, but could be added here
            del self.download_managers[session_id]
        
        if session_id in self.stems_extractors:
            print(f"Cleaning up stems extractor for session {session_id}")
            # No specific cleanup needed right now, but could be added here
            del self.stems_extractors[session_id]

# Create the session manager
session_manager = SessionManager()

# Helper function to get or create session ID
def get_session_id():
    """
    Get or create a session ID.
    If the user is authenticated, use the user ID as part of the session ID to ensure
    that the session is tied to the user account.
    """
    if 'session_id' not in session:
        # If user is authenticated, include user ID in session ID for persistence
        if current_user.is_authenticated:
            # Create a session ID that includes the user ID for persistence across logins
            user_prefix = f"user_{current_user.id}_"
            session['session_id'] = f"{user_prefix}{str(uuid.uuid4())}"
        else:
            # For unauthenticated users, just use a random UUID
            session['session_id'] = str(uuid.uuid4())
        
        print(f"Created new session: {session['session_id']}")
    
    return session['session_id']

# Setup callbacks for real-time updates
def on_download_progress(session_id, download_id, progress, speed, eta):
    """Callback for download progress updates."""
    try:
        # Formater la progression avec 1 décimale pour la cohérence
        formatted_progress = float(f"{progress:.1f}")
        
        # Préparer les données à envoyer
        data = {
            'download_id': download_id,
            'progress': formatted_progress,
            'speed': speed,
            'eta': eta
        }
        
        print(f"DEBUG - on_download_progress appelé pour session {session_id}: {download_id} - {formatted_progress:.1f}% - {speed} - {eta}")
        
        # Émettre l'événement avec les données dans la room spécifique à la session
        socketio.emit('download_progress', data, room=session_id)
        print(f"DEBUG - socketio.emit('download_progress') envoyé à la room {session_id}")
    except Exception as e:
        print(f"Error in on_download_progress: {e}")

def on_download_complete(session_id, download_id, title, file_path):
    """Callback for download completion."""
    try:
        # Préparer les données à envoyer
        data = {
            'download_id': download_id,
            'title': title,
            'file_path': file_path
        }
        
        print(f"Download complete for session {session_id}: {download_id} - {title}")
        
        # Émettre l'événement avec les données dans la room spécifique à la session
        socketio.emit('download_complete', data, room=session_id)
    except Exception as e:
        print(f"Error in on_download_complete: {e}")

def on_download_error(session_id, download_id, error_message):
    """Callback for download errors."""
    try:
        # Préparer les données à envoyer
        data = {
            'download_id': download_id,
            'error_message': error_message
        }
        
        print(f"Download error for session {session_id}: {download_id} - {error_message}")
        
        # Émettre l'événement avec les données dans la room spécifique à la session
        socketio.emit('download_error', data, room=session_id)
    except Exception as e:
        print(f"Error in on_download_error: {e}")

def on_extraction_progress(session_id, extraction_id, progress, status_message):
    """Callback for extraction progress updates."""
    try:
        # Préparer les données à envoyer
        data = {
            'extraction_id': extraction_id,
            'progress': progress,
            'status_message': status_message
        }
        
        # Émettre l'événement avec les données dans la room spécifique à la session
        socketio.emit('extraction_progress', data, room=session_id)
    except Exception as e:
        print(f"Error in on_extraction_progress: {e}")

def on_extraction_complete(session_id, extraction_id):
    """Callback for extraction completion."""
    try:
        stems_extractor = session_manager.get_stems_extractor(session_id)
        item = stems_extractor.get_extraction_status(extraction_id)
        if item:
            # Préparer les données à envoyer
            data = {
                'extraction_id': extraction_id,
                'output_paths': item.output_paths,
                'zip_path': item.zip_path
            }
            
            # Émettre l'événement avec les données dans la room spécifique à la session
            socketio.emit('extraction_complete', data, room=session_id)
    except Exception as e:
        print(f"Error in on_extraction_complete: {e}")

def on_extraction_error(session_id, extraction_id, error_message):
    """Callback for extraction errors."""
    try:
        # Préparer les données à envoyer
        data = {
            'extraction_id': extraction_id,
            'error_message': error_message
        }
        
        # Émettre l'événement avec les données dans la room spécifique à la session
        socketio.emit('extraction_error', data, room=session_id)
    except Exception as e:
        print(f"Error in on_extraction_error: {e}")

# Routes
@app.route('/')
@login_required
def index():
    """Render the main application page."""
    # Ensure session ID is created
    session_id = get_session_id()
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handle user login."""
    error = None
    message = None
    
    # Check if user is already logged in
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = 'remember' in request.form
        
        if not username or not password:
            error = 'Username and password are required.'
        else:
            user_data = authenticate_user(username, password)
            if user_data:
                user = User(user_data)
                login_user(user, remember=remember)
                
                # Get the next page from the request, defaulting to index
                next_page = request.args.get('next', url_for('index'))
                
                # Security check to make sure the next page is within our app
                if not next_page.startswith('/'):
                    next_page = url_for('index')
                
                return redirect(next_page)
            else:
                error = 'Invalid username or password.'
    
    return render_template('login.html', error=error, message=message, current_year=datetime.now().year)

@app.route('/logout')
@login_required
def logout():
    """Handle user logout."""
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/admin')
@login_required
@admin_required
def admin():
    """Render the admin interface."""
    users = get_all_users()
    return render_template('admin.html', users=users)

@app.route('/admin/add_user', methods=['POST'])
@login_required
@admin_required
def admin_add_user():
    """Add a new user."""
    username = request.form.get('username')
    password = request.form.get('password')
    email = request.form.get('email')
    is_admin = 'is_admin' in request.form
    
    if not username or not password:
        flash('Username and password are required.', 'error')
        return redirect(url_for('admin'))
    
    success = create_user(username, password, email, is_admin)
    if success:
        flash(f'User {username} created successfully.', 'success')
    else:
        flash(f'Failed to create user. Username {username} may already exist.', 'error')
    
    return redirect(url_for('admin'))

@app.route('/admin/edit_user', methods=['POST'])
@login_required
@admin_required
def admin_edit_user():
    """Edit an existing user."""
    user_id = request.form.get('user_id')
    username = request.form.get('username')
    email = request.form.get('email')
    is_admin = 'is_admin' in request.form
    
    if not user_id or not username:
        flash('User ID and username are required.', 'error')
        return redirect(url_for('admin'))
    
    # Prevent removing admin status from the last admin
    if not is_admin:
        user_data = get_user_by_id(user_id)
        if user_data and user_data['is_admin']:
            # Count admins
            users = get_all_users()
            admin_count = sum(1 for user in users if user['is_admin'])
            if admin_count <= 1:
                flash('Cannot remove admin status from the last admin user.', 'error')
                return redirect(url_for('admin'))
    
    success = update_user(user_id, username, email, is_admin)
    if success:
        flash(f'User {username} updated successfully.', 'success')
    else:
        flash('Failed to update user.', 'error')
    
    return redirect(url_for('admin'))

@app.route('/admin/reset_password', methods=['POST'])
@login_required
@admin_required
def admin_reset_password():
    """Reset a user's password."""
    user_id = request.form.get('user_id')
    password = request.form.get('password')
    
    if not user_id or not password:
        flash('User ID and password are required.', 'error')
        return redirect(url_for('admin'))
    
    success = change_password(user_id, password)
    if success:
        flash('Password reset successfully.', 'success')
    else:
        flash('Failed to reset password.', 'error')
    
    return redirect(url_for('admin'))

@app.route('/admin/delete_user', methods=['POST'])
@login_required
@admin_required
def admin_delete_user():
    """Delete a user."""
    user_id = request.form.get('user_id')
    
    if not user_id:
        flash('User ID is required.', 'error')
        return redirect(url_for('admin'))
    
    # Prevent deleting the last admin
    user_data = get_user_by_id(user_id)
    if user_data and user_data['is_admin']:
        # Count admins
        users = get_all_users()
        admin_count = sum(1 for user in users if user['is_admin'])
        if admin_count <= 1:
            flash('Cannot delete the last admin user.', 'error')
            return redirect(url_for('admin'))
    
    # Prevent deleting yourself
    if int(user_id) == current_user.id:
        flash('You cannot delete your own account.', 'error')
        return redirect(url_for('admin'))
    
    success = delete_user(user_id)
    if success:
        flash('User deleted successfully.', 'success')
    else:
        flash('Failed to delete user.', 'error')
    
    return redirect(url_for('admin'))

# Note: The following routes have been removed as they referenced non-existent templates:
# - /results (results.html)
# - /extraction (extraction.html) 
# - /downloads (downloads.html)
# These features are now integrated into the main application flow

@app.route('/mixer')
@login_required
def mixer():
    """Render the mixer page with modular interface."""
    extraction_id = request.args.get('extraction_id', '')
    return render_template('mixer.html', extraction_id=extraction_id)

# API Routes - Search
@app.route('/api/search', methods=['GET'])
@api_login_required
def search_videos():
    """Search for YouTube videos."""
    query = request.args.get('query', '')
    max_results = int(request.args.get('max_results', 10))
    
    if not query:
        return jsonify({
            'error': 'No query provided'
        }), 400
    
    try:
        print(f"Searching for '{query}', max_results={max_results}")
        response = aiotube_client.search_videos(query, max_results=max_results)
        
        # Si la réponse est déjà un dictionnaire avec une clé 'items', on la retourne directement
        if isinstance(response, dict) and 'items' in response:
            print(f"Response already has 'items' key with {len(response['items'])} results")
            return jsonify(response)
        
        # Si la réponse est une liste, on la transforme en dictionnaire avec une clé 'items'
        if isinstance(response, list):
            print(f"Converting list response with {len(response)} items to dict with 'items' key")
            results = response
        else:
            print(f"Unexpected response type: {type(response)}")
            results = []
        
        print(f"Found {len(results)} results")
        
        # Ensure each result has an id and videoId
        for i, result in enumerate(results):
            print(f"Processing result {i}: {result.get('id', 'No ID')}")
            if 'id' in result and isinstance(result['id'], dict) and 'videoId' in result['id']:
                # Already in the correct format
                print(f"  Result {i} has correct id format: {result['id']}")
                pass
            elif 'id' in result and isinstance(result['id'], str):
                # Convert to the expected format
                video_id = result['id']
                print(f"  Converting result {i} id from string '{video_id}' to dict format")
                result['id'] = {'videoId': video_id}
            else:
                # Create a placeholder
                print(f"  Result {i} has no valid id, creating placeholder")
                result['id'] = {'videoId': 'unknown'}
        
        # Créer la structure de réponse attendue par le frontend
        formatted_response = {
            'items': results,
            'pageInfo': {
                'totalResults': len(results),
                'resultsPerPage': len(results)
            }
        }
        
        print(f"Returning formatted response with {len(results)} results")
        return jsonify(formatted_response)
    except Exception as e:
        print(f"Error in search_videos: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/video/<video_id>', methods=['GET'])
@api_login_required
def get_video_info(video_id):
    """Get information about a specific YouTube video."""
    info = aiotube_client.get_video_info(video_id)
    if info:
        return jsonify(info)
    return jsonify({'error': 'Video not found'}), 404

# API Routes - Downloads
@app.route('/api/downloads', methods=['GET'])
@api_login_required
def get_all_downloads():
    """Get all downloads for the current session."""
    try:
        session_id = get_session_id()
        download_manager = session_manager.get_download_manager(session_id)
        
        # Récupérer les téléchargements sous forme de dictionnaire
        downloads_dict = download_manager.get_all_downloads()
        
        # Convertir en liste plate pour le frontend
        downloads_list = []
        for status_type in ['active', 'queued', 'completed', 'failed']:
            if status_type in downloads_dict:
                for item in downloads_dict[status_type]:
                    # Convert to dictionary and add status type
                    item_dict = {
                        'download_id': item.download_id,
                        'video_id': item.video_id,
                        'title': item.title,
                        'thumbnail_url': item.thumbnail_url,
                        'type': item.download_type.value,
                        'quality': item.quality,
                        'status': item.status.value,
                        'progress': item.progress,
                        'speed': item.speed,
                        'eta': item.eta,
                        'file_path': item.file_path,
                        'error_message': item.error_message
                    }
                    downloads_list.append(item_dict)
        
        return jsonify(downloads_list)
    except Exception as e:
        print(f"Error getting downloads: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/<download_id>', methods=['GET'])
@api_login_required
def get_download_status(download_id):
    """Get the status of a download."""
    try:
        session_id = get_session_id()
        download_manager = session_manager.get_download_manager(session_id)
        
        item = download_manager.get_download_status(download_id)
        if item:
            item_dict = {
                'download_id': item.download_id,
                'video_id': item.video_id,
                'title': item.title,
                'thumbnail_url': item.thumbnail_url,
                'type': item.download_type.value,
                'quality': item.quality,
                'status': item.status.value,
                'progress': item.progress,
                'speed': item.speed,
                'eta': item.eta,
                'file_path': item.file_path,
                'error_message': item.error_message
            }
            return jsonify(item_dict)
        else:
            return jsonify({'error': 'Download not found'}), 404
    except Exception as e:
        print(f"Error getting download status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads', methods=['POST'])
@api_login_required
def add_download():
    """Add a download to the queue."""
    try:
        print("Received download request")
        data = request.json
        
        print(f"Request data: {data}")
        
        if not data:
            print("No data provided in request")
            return jsonify({'error': 'No data provided'}), 400
        
        session_id = get_session_id()
        download_manager = session_manager.get_download_manager(session_id)
        
        # Validate required fields
        required_fields = ['video_id', 'title', 'thumbnail_url', 'download_type', 'quality']
        for field in required_fields:
            if field not in data:
                print(f"Missing required field: {field}")
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Safely convert download type
        try:
            download_type_str = str(data['download_type']).lower()
            print(f"Converting download type: '{download_type_str}'")
            
            # Vérifier manuellement les valeurs possibles
            if download_type_str == 'audio':
                download_type = DownloadType.AUDIO
            elif download_type_str == 'video':
                download_type = DownloadType.VIDEO
            else:
                print(f"Unknown download type: '{download_type_str}', defaulting to AUDIO")
                download_type = DownloadType.AUDIO
        except Exception as e:
            print(f"Error converting download type: {e}")
            # Default to audio if type is invalid
            download_type = DownloadType.AUDIO
        
        # Create download item
        print(f"Creating download item with video_id: {data['video_id']}, title: {data['title']}")
        item = DownloadItem(
            video_id=data['video_id'],
            title=data['title'],
            thumbnail_url=data['thumbnail_url'],
            download_type=download_type,
            quality=data['quality']
        )
        
        # Add to queue
        print(f"Adding download to queue")
        download_id = download_manager.add_download(item)
        
        print(f"Download added with ID: {download_id}")
        return jsonify({'download_id': download_id})
    except Exception as e:
        print(f"Error adding download: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/<download_id>', methods=['DELETE'])
@api_login_required
def cancel_download(download_id):
    """Cancel a download."""
    try:
        session_id = get_session_id()
        download_manager = session_manager.get_download_manager(session_id)
        
        success = download_manager.cancel_download(download_id)
        return jsonify({'success': success})
    except Exception as e:
        print(f"Error cancelling download: {e}")
        return jsonify({'error': str(e)}), 500

# API Routes - Extractions
@app.route('/api/extractions', methods=['GET'])
@api_login_required
def get_all_extractions():
    """Get all extractions for the current session."""
    try:
        session_id = get_session_id()
        stems_extractor = session_manager.get_stems_extractor(session_id)
        
        # Récupérer les extractions sous forme de dictionnaire
        extractions_dict = stems_extractor.get_all_extractions()
        
        # Convertir en liste plate pour le frontend
        extractions_list = []
        for status_type in ['active', 'queued', 'completed', 'failed']:
            if status_type in extractions_dict:
                for item in extractions_dict[status_type]:
                    # Convert to dictionary and add status type
                    item_dict = {
                        'extraction_id': item.extraction_id,
                        'audio_path': item.audio_path,
                        'model_name': item.model_name,
                        'output_dir': item.output_dir,
                        'selected_stems': item.selected_stems,
                        'two_stem_mode': item.two_stem_mode,
                        'primary_stem': item.primary_stem,
                        'status': item.status.value,
                        'progress': item.progress,
                        'error_message': item.error_message,
                        'output_paths': item.output_paths,
                        'zip_path': item.zip_path
                    }
                    extractions_list.append(item_dict)
        
        return jsonify(extractions_list)
    except Exception as e:
        print(f"Error getting extractions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>', methods=['GET'])
@api_login_required
def get_extraction_status(extraction_id):
    """Get the status of an extraction."""
    try:
        session_id = get_session_id()
        stems_extractor = session_manager.get_stems_extractor(session_id)
        
        item = stems_extractor.get_extraction_status(extraction_id)
        if item:
            item_dict = {
                'extraction_id': item.extraction_id,
                'audio_path': item.audio_path,
                'model_name': item.model_name,
                'output_dir': item.output_dir,
                'selected_stems': item.selected_stems,
                'two_stem_mode': item.two_stem_mode,
                'primary_stem': item.primary_stem,
                'status': item.status.value,
                'progress': item.progress,
                'error_message': item.error_message,
                'output_paths': item.output_paths,
                'zip_path': item.zip_path
            }
            return jsonify(item_dict)
        else:
            return jsonify({'error': 'Extraction not found'}), 404
    except Exception as e:
        print(f"Error getting extraction status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions', methods=['POST'])
@api_login_required
def add_extraction():
    """Add an extraction to the queue."""
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        session_id = get_session_id()
        stems_extractor = session_manager.get_stems_extractor(session_id)
        
        # Create extraction item
        item = ExtractionItem(
            audio_path=data['audio_path'],
            model_name=data['model_name'],
            output_dir=data.get('output_dir', os.path.join(os.path.dirname(data['audio_path']), 'stems')),
            selected_stems=data['selected_stems'],
            two_stem_mode=data.get('two_stem_mode', False),
            primary_stem=data.get('primary_stem', 'vocals')
        )
        
        # Add to queue
        extraction_id = stems_extractor.add_extraction(item)
        
        return jsonify({'extraction_id': extraction_id})
    except Exception as e:
        print(f"Error adding extraction: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>', methods=['DELETE'])
@api_login_required
def cancel_extraction(extraction_id):
    """Cancel an extraction."""
    try:
        session_id = get_session_id()
        stems_extractor = session_manager.get_stems_extractor(session_id)
        
        success = stems_extractor.cancel_extraction(extraction_id)
        return jsonify({'success': success})
    except Exception as e:
        print(f"Error cancelling extraction: {e}")
        return jsonify({'error': str(e)}), 500

# API Routes - Configuration
@app.route('/api/config', methods=['GET'])
@api_login_required
def get_config():
    """Get application configuration."""
    # Get session-specific stems extractor for GPU info
    session_id = get_session_id()
    stems_extractor = session_manager.get_stems_extractor(session_id)
    
    config = {
        'downloads_directory': ensure_valid_downloads_directory(),
        'max_concurrent_downloads': get_setting('max_concurrent_downloads', 3),
        'preferred_video_quality': get_setting('preferred_video_quality', 'best'),
        'preferred_audio_quality': get_setting('preferred_audio_quality', 'best'),
        'use_gpu_for_extraction': get_setting('use_gpu_for_extraction', True),
        'default_stem_model': get_setting('default_stem_model', 'htdemucs'),
        'ffmpeg_path': get_ffmpeg_path(),
        'ffprobe_path': get_ffprobe_path(),
        'using_gpu': stems_extractor.using_gpu
    }
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
@api_login_required
def update_config():
    """Update application configuration."""
    data = request.json
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Update settings
    for key, value in data.items():
        update_setting(key, value)
    
    return jsonify({'success': True})

@app.route('/api/config/ffmpeg/check', methods=['GET'])
@api_login_required
def check_ffmpeg():
    """Check if FFmpeg is available."""
    ffmpeg_path = get_ffmpeg_path()
    ffprobe_path = get_ffprobe_path()
    
    return jsonify({
        'ffmpeg_available': os.path.exists(ffmpeg_path) if ffmpeg_path != 'ffmpeg' else False,
        'ffprobe_available': os.path.exists(ffprobe_path) if ffprobe_path != 'ffprobe' else False,
        'ffmpeg_path': ffmpeg_path,
        'ffprobe_path': ffprobe_path
    })

@app.route('/api/config/ffmpeg/download', methods=['POST'])
@api_login_required
def download_ffmpeg_route():
    """Download and set up FFmpeg."""
    success, message = download_ffmpeg()
    return jsonify({
        'success': success,
        'message': message
    })

@app.route('/api/open-folder', methods=['POST'])
@api_login_required
def open_folder_route():
    """Open a folder in the file explorer."""
    try:
        data = request.json
        folder_path = data.get('folder_path')
        
        if not folder_path or not os.path.exists(folder_path):
            return jsonify({
                'success': False,
                'message': 'Invalid folder path'
            }), 400
        
        # Normaliser le chemin pour s'assurer qu'il est valide
        folder_path = os.path.normpath(folder_path)
        
        # Ouvrir le dossier avec la commande appropriée selon le système d'exploitation
        if os.name == 'nt':  # Windows
            os.startfile(folder_path)
        elif os.name == 'posix':  # Linux, macOS
            subprocess.call(['xdg-open', folder_path]) if sys.platform == 'linux' else subprocess.call(['open', folder_path])
        
        return jsonify({
            'success': True,
            'message': f'Folder opened: {folder_path}'
        })
    except Exception as e:
        print(f"Error opening folder: {e}")
        return jsonify({
            'success': False,
            'message': f'Error opening folder: {str(e)}'
        }), 500

@app.route('/api/download-file', methods=['GET'])
@api_login_required
def download_file_route():
    """Download a file."""
    try:
        file_path = request.args.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'message': 'Invalid file path'
            }), 400
        
        # Normaliser le chemin pour s'assurer qu'il est valide
        file_path = os.path.normpath(file_path)
        
        # Vérifier que le fichier existe
        if not os.path.isfile(file_path):
            return jsonify({
                'success': False,
                'message': 'File not found'
            }), 404
        
        # Récupérer le nom du fichier
        filename = os.path.basename(file_path)
        
        # Le dossier contenant le fichier
        directory = os.path.dirname(file_path)
        
        return send_from_directory(
            directory, 
            filename, 
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"Error downloading file: {e}")
        return jsonify({
            'success': False,
            'message': f'Error downloading file: {str(e)}'
        }), 500

@app.route('/api/download/file', methods=['GET'])
@api_login_required
def download_file_compatible():
    """Route compatible pour le téléchargement de fichiers."""
    # Convertir path en file_path
    path = request.args.get('path')
    if path:
        request.args = request.args.copy()
        request.args = dict(request.args)
        request.args['file_path'] = path
    return download_file_route()

@app.route('/api/test_stems/<stem_file>', methods=['GET'])
@api_login_required
def test_stems(stem_file):
    """Serve test stems from the Creedence folder."""
    stem_dir = r"C:\Users\micha\Downloads\Creedence Clearwater Revival - Have You Ever Seen The Rain (Official)_stems"
    return send_from_directory(stem_dir, stem_file)

@app.route('/api/extracted_stems/<extraction_id>/<stem_file>', methods=['GET'])
@api_login_required
def extracted_stems(extraction_id, stem_file):
    """Serve extracted stems from the extraction output directory."""
    try:
        print(f"Requête de stem reçue: extraction={extraction_id}, fichier={stem_file}")
        
        # Récupérer les informations sur l'extraction
        session_id = get_session_id()
        stems_extractor = session_manager.get_stems_extractor(session_id)
        
        # Décoder l'extraction_id si nécessaire
        import urllib.parse
        decoded_extraction_id = urllib.parse.unquote(extraction_id)
        print(f"Extraction ID décodé: {decoded_extraction_id}")
        
        item = stems_extractor.get_extraction_status(decoded_extraction_id)
        
        print(f"Statut de l'extraction: {item is not None}")
        
        if not item or not item.output_paths:
            print(f"Extraction non trouvée ou pas de chemins de sortie disponibles: {decoded_extraction_id}")
            return "Extraction not found or no output paths available", 404
        
        # Afficher tous les chemins disponibles pour le débogage
        print(f"Chemins de sortie disponibles:")
        for stem_name, stem_path in item.output_paths.items():
            print(f"  - {stem_name}: {stem_path}")
        
        # Trouver le chemin du dossier qui contient les stems
        stem_dir = os.path.dirname(list(item.output_paths.values())[0])
        print(f"Dossier des stems: {stem_dir}")
        
        # Vérifier si le fichier existe
        full_path = os.path.join(stem_dir, stem_file)
        if not os.path.exists(full_path):
            print(f"Fichier stem non trouvé: {full_path}")
            return f"Stem file {stem_file} not found in extraction {decoded_extraction_id}", 404
            
        print(f"Fichier stem trouvé, envoi: {full_path}")
        return send_from_directory(stem_dir, stem_file)
    except Exception as e:
        print(f"Error serving extracted stem: {e}")
        import traceback
        traceback.print_exc()
        return str(e), 500

@app.route('/api/waveform/<path:file_path>', methods=['GET'])
@api_login_required
def get_waveform(file_path):
    """Génère les données de forme d'onde pour un fichier audio."""
    try:
        # Vérifier si le fichier existe et est accessible
        full_path = os.path.abspath(file_path)
        print(f"Tentative de génération de forme d'onde pour: {full_path}")
        
        if not os.path.exists(full_path):
            print(f"Fichier non trouvé: {full_path}")
            # Si le fichier n'existe pas, génerer une forme d'onde factice
            # pour éviter de bloquer l'interface
            dummy_waveform = [0] * int(request.args.get('samples', 200))
            return {
                "success": True,
                "waveform": dummy_waveform,
                "duration": 0,
                "sample_rate": 8000,
                "dummy": True
            }
        
        # Pour des raisons de performance, nous échantillonnons la forme d'onde
        # plutôt que de renvoyer toutes les données
        sample_count = int(request.args.get('samples', 200))
        
        try:
            # Utiliser librosa pour analyser l'audio (meilleure qualité)
            import librosa
            
            # Lire l'audio avec librosa
            print(f"Chargement de l'audio avec librosa: {full_path}")
            audio_data, sr = librosa.load(full_path, sr=8000, mono=True, duration=60)
            
            # Redimensionner pour obtenir le nombre exact d'échantillons demandés
            if len(audio_data) > sample_count:
                # Sous-échantillonner pour obtenir le nombre exact d'échantillons
                indices = np.linspace(0, len(audio_data) - 1, sample_count, dtype=int)
                audio_data = audio_data[indices]
            else:
                # Remplir avec des zéros si l'audio est trop court
                padding = np.zeros(sample_count - len(audio_data))
                audio_data = np.concatenate([audio_data, padding])
            
            # Obtenez la durée réelle du fichier audio
            duration = librosa.get_duration(path=full_path)
            
            # Normaliser le waveform pour qu'il soit plus visible
            if audio_data.max() != 0 or audio_data.min() != 0:
                max_val = max(abs(audio_data.max()), abs(audio_data.min()))
                audio_data = audio_data / max_val  # Normaliser entre -1 et 1
            
            # Convertir en liste pour la sérialisation JSON
            waveform_data = audio_data.tolist()
            
            print(f"Forme d'onde générée avec succès, {len(waveform_data)} échantillons")
            
            return {
                "success": True,
                "waveform": waveform_data,
                "duration": duration,
                "sample_rate": 8000
            }
            
        except Exception as lib_error:
            print(f"Erreur avec librosa: {lib_error}")
            # Si librosa échoue, utiliser FFmpeg comme alternative
            try:
                # Utiliser FFmpeg pour extraire les données audio
                ffmpeg_path = get_ffmpeg_path()
                ffprobe_path = get_ffprobe_path()
                
                # Obtenir la durée avec ffprobe
                probe_cmd = [
                    ffprobe_path, "-v", "quiet", "-print_format", "json", 
                    "-show_format", "-show_streams", full_path
                ]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                metadata = json.loads(probe_result.stdout) if probe_result.stdout else {"format": {"duration": "0"}}
                
                # Extraire les données audio et les convertir en forme d'onde
                cmd = [
                    ffmpeg_path, "-i", full_path, "-ac", "1", "-filter:a",
                    f"aresample=8000,asetnsamples={sample_count}", "-f", "data", "-"
                ]
                
                result = subprocess.run(cmd, capture_output=True, timeout=10)
                
                # Convertir les données brutes en valeurs normalisées
                audio_data = np.frombuffer(result.stdout, dtype=np.int16)
                
                # Normaliser entre -1 et 1
                max_val = max(abs(audio_data.min()), abs(audio_data.max())) if len(audio_data) > 0 else 1
                if max_val > 0:
                    normalized_data = audio_data.astype(np.float32) / max_val
                else:
                    normalized_data = audio_data.astype(np.float32)
                
                # Convertir en liste pour la sérialisation JSON
                waveform_data = normalized_data.tolist()
                
                print(f"Forme d'onde générée avec FFmpeg, {len(waveform_data)} échantillons")
                
                return {
                    "success": True,
                    "waveform": waveform_data,
                    "duration": float(metadata["format"]["duration"]) if "format" in metadata and "duration" in metadata["format"] else 0,
                    "sample_rate": 8000
                }
            
            except subprocess.TimeoutExpired:
                print(f"Timeout lors de la génération de la forme d'onde pour {full_path}")
            except Exception as e:
                print(f"Erreur lors de la génération de la forme d'onde avec FFmpeg: {str(e)}")
        
    except Exception as e:
        print(f"Erreur lors de la génération de la forme d'onde: {str(e)}")
    
    # En cas d'échec, générer une forme d'onde factice
    sample_count = int(request.args.get('samples', 200))
    print("Génération d'une forme d'onde factice")
    return {
        "success": True,
        "waveform": [0] * sample_count,
        "sample_rate": 8000,
        "dummy": True
    }

@app.route('/api/export_mix', methods=['POST'])
@api_login_required
def export_mix():
    """Exporte un mix avec les réglages actuels."""
    data = request.json
    stems_data = data.get('stems', {})
    
    try:
        # Créer un répertoire temporaire pour le traitement
        temp_dir = tempfile.mkdtemp()
        output_file = os.path.join(ensure_valid_downloads_directory(), f"mix_{uuid.uuid4()}.wav")
        
        # Traiter chaque stem avec FFmpeg
        processed_stems = []
        
        for stem_name, stem_config in stems_data.items():
            if not stem_config.get('active', True):
                continue  # Ignorer les stems désactivés
                
            stem_path = stem_config.get('path')
            volume = float(stem_config.get('volume', 1.0))
            pan = float(stem_config.get('pan', 0.0))
            
            # Nom du fichier temporaire pour ce stem traité
            processed_stem = os.path.join(temp_dir, f"{stem_name}_processed.wav")
            
            # Construire la commande FFmpeg pour appliquer volume et pan
            ffmpeg_path = get_ffmpeg_path()
            
            # Calculer les niveaux de pan pour les canaux
            if pan < 0:  # Gauche
                left_vol = 1.0
                right_vol = 1.0 + pan  # pan est négatif, donc cela réduit le volume droit
            else:  # Droite ou centre
                left_vol = 1.0 - pan
                right_vol = 1.0
                
            # Appliquer le volume global après le pan
            left_vol *= volume
            right_vol *= volume
            
            cmd = [
                ffmpeg_path, "-y", "-i", stem_path,
                "-af", f"volume={volume},pan=stereo|c0={left_vol}*c0|c1={right_vol}*c1",
                processed_stem
            ]
            
            subprocess.run(cmd, check=True)
            processed_stems.append(processed_stem)
        
        if not processed_stems:
            return jsonify({"success": False, "error": "Aucun stem actif à exporter"})
        
        # Fusionner tous les stems traités
        inputs = []
        for stem in processed_stems:
            inputs.extend(["-i", stem])
        
        cmd = [
            ffmpeg_path, "-y",
            *inputs,
            "-filter_complex", f"amix=inputs={len(processed_stems)}:duration=longest:dropout_transition=2",
            "-b:a", "320k", output_file
        ]
        
        subprocess.run(cmd, check=True)
        
        # Nettoyer les fichiers temporaires
        shutil.rmtree(temp_dir)
        
        return jsonify({
            "success": True,
            "file_path": output_file
        })
    except Exception as e:
        print(f"Erreur lors de l'exportation du mix: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/waveform_raw', methods=['GET'])
@api_login_required
def get_waveform_from_url():
    """Génère les données de forme d'onde à partir d'une URL audio."""
    try:
        # Récupérer l'URL audio depuis les paramètres
        audio_url = request.args.get('url')
        if not audio_url:
            return jsonify({"success": False, "error": "URL audio non spécifiée"})
        
        # Convertir l'URL en chemin local
        # Exemple: /api/extracted_stems/ID/vocals.mp3 → C:\chemin\vers\stems\vocals.mp3
        if audio_url.startswith('/api/extracted_stems/'):
            # Extraire l'ID d'extraction et le nom du fichier
            path_parts = audio_url.split('/')
            extraction_id = path_parts[-2]
            stem_file = path_parts[-1]
            
            # Récupérer la session et l'extracteur
            session_id = get_session_id()
            stems_extractor = session_manager.get_stems_extractor(session_id)
            
            # Obtenir l'extraction depuis l'extracteur
            item = stems_extractor.get_extraction_status(extraction_id)
            
            if item and hasattr(item, 'output_paths') and item.output_paths:
                # Chercher le stem spécifique par son nom de fichier
                stem_path = None
                print(f"Génération de waveform pour {stem_file}, extraction {extraction_id}")
                print(f"Chemins disponibles: {item.output_paths}")
                
                for output_name, output_path in item.output_paths.items():
                    if os.path.basename(output_path) == stem_file:
                        stem_path = output_path
                        break
                
                # Si on ne trouve pas de correspondance exacte, prendre le dossier du premier stem
                if not stem_path and item.output_paths:
                    first_stem = list(item.output_paths.values())[0]
                    stem_dir = os.path.dirname(first_stem)
                    stem_path = os.path.join(stem_dir, stem_file)
                
                if stem_path:
                    full_path = stem_path
                    print(f"Chemin du stem trouvé: {full_path}")
                    
                    # Vérifier si le fichier existe
                    if not os.path.exists(full_path):
                        print(f"Fichier non trouvé: {full_path}")
                        # Générer une forme d'onde factice
                        sample_count = int(request.args.get('samples', 200))
                        return jsonify({
                            "success": True,
                            "waveform": [0] * sample_count,
                            "sample_rate": 8000,
                            "dummy": True
                        })
                    
                    # Générer la forme d'onde à partir du fichier local
                    print(f"Génération de la forme d'onde à partir de {full_path}")
                    return jsonify(get_waveform(full_path))
            else:
                print(f"Extraction introuvable ou pas de fichiers disponibles: {extraction_id}")
        
        # Cas où l'URL ne correspond pas à un stem extrait
        print(f"URL non reconnue comme stem extrait, tentative de traitement direct: {audio_url}")
        
        # Télécharger le fichier audio s'il s'agit d'une URL distante
        if audio_url.startswith(('http://', 'https://')):
            # Télécharger le fichier audio temporairement
            import tempfile
            import requests
            
            temp_dir = tempfile.gettempdir()
            temp_file = os.path.join(temp_dir, 'temp_audio.mp3')
            
            try:
                response = requests.get(audio_url, stream=True, timeout=10)
                response.raise_for_status()
                
                with open(temp_file, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                # Générer la forme d'onde à partir du fichier téléchargé
                return jsonify(get_waveform(temp_file))
                
                # Nettoyer
                try:
                    os.remove(temp_file)
                except:
                    pass
            except Exception as e:
                print(f"Erreur lors du téléchargement de l'audio: {e}")
                return jsonify({"success": False, "error": f"Erreur lors du téléchargement: {str(e)}"})
        else:
            # Pour les URL relatives comme /static/audio/test.mp3
            local_path = os.path.join(app.root_path, audio_url.lstrip('/'))
            if os.path.exists(local_path):
                return jsonify(get_waveform(local_path))
        
        # Si on n'a pas pu générer de forme d'onde, retourner une erreur
        print(f"Impossible de générer une forme d'onde pour {audio_url}")
        return jsonify({
            "success": False, 
            "error": "Impossible de générer une forme d'onde pour cette URL"
        })
    except Exception as e:
        print(f"Erreur dans get_waveform_from_url: {e}")
        # Générer une forme d'onde factice en cas d'erreur
        sample_count = int(request.args.get('samples', 200))
        return jsonify({
            "success": True,
            "waveform": [0] * sample_count,
            "sample_rate": 8000,
            "dummy": True,
            "error": str(e)
        })

@app.route('/api/list-files', methods=['POST'])
@api_login_required
def list_files_route():
    """List files in a directory."""
    try:
        data = request.json
        folder_path = data.get('folder_path')
        
        if not folder_path or not os.path.exists(folder_path):
            return jsonify({
                'success': False,
                'message': 'Invalid folder path or folder does not exist'
            }), 400
        
        # Normaliser le chemin pour s'assurer qu'il est valide
        folder_path = os.path.normpath(folder_path)
        
        # Vérifier que le chemin est un dossier
        if not os.path.isdir(folder_path):
            return jsonify({
                'success': False,
                'message': 'Path is not a directory'
            }), 400
        
        # Lister les fichiers dans le dossier
        files = []
        for file_name in os.listdir(folder_path):
            file_path = os.path.join(folder_path, file_name)
            
            # Ne prendre que les fichiers (pas les dossiers)
            if os.path.isfile(file_path):
                files.append({
                    'name': file_name,
                    'path': file_path,
                    'size': os.path.getsize(file_path)
                })
        
        return jsonify({
            'success': True,
            'files': files
        })
    except Exception as e:
        print(f"Error listing files: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'Error listing files: {str(e)}'
        }), 500

# WebSocket events
@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    # Get the session ID for this connection
    session_id = get_session_id()
    
    # Check if user is authenticated
    if not current_user.is_authenticated:
        # In Socket.IO, we can't return a 401 status, but we can emit an error event
        # The client should handle this by redirecting to the login page
        emit('auth_error', {
            'error': 'Unauthorized',
            'message': 'Authentication required',
            'redirect': url_for('login')
        })
        return False  # Reject the connection
    
    # Join a room specific to this session
    join_room(session_id)
    print(f"Client connected and joined room: {session_id}")
    
    # Send initial data
    emit('connection_established', {'session_id': session_id})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    # Get the session ID for this connection
    session_id = get_session_id()
    
    # Leave the room specific to this session
    leave_room(session_id)
    print(f"Client disconnected from room: {session_id}")
    
    # Clean up resources if needed
    # session_manager.cleanup_session(session_id)

# Check if the application is already running
if __name__ == '__main__':
    import socket
    import os
    
    # Use environment variable to detect if this is the reloader process
    is_reloader = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    
    # Fixed port - always use 5001
    port = 5011
    
    # Only check port availability in the main process (not the reloader)
    if not is_reloader:
        try:
            # Test if the port is available
            test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            test_socket.bind(('0.0.0.0', port))
            test_socket.close()
            
            print(f"Starting StemTubes Web on http://0.0.0.0:{port}")
            print(f"Access locally via: http://127.0.0.1:{port}")
            print(f"Access from other devices via: http://<your-ip-address>:{port}")
        except OSError:
            print(f"ERROR: Port {port} is already in use.")
            print("Please ensure no other instances of the application are running.")
            print("You can use 'netstat -ano | findstr :5001' to find which process is using port 5001")
            print("Then use 'taskkill /F /PID <process_id>' to terminate it.")
            exit(1)
    
    # Run the application
    socketio.run(app, host='0.0.0.0', port=port, debug=True)
