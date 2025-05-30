"""
Database module for authentication in StemTube Web.
Handles user management and authentication.
"""
import os
import sqlite3
import time
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import secrets
import string

# Path to the database file
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'stemtubes.db')

def get_db_connection():
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database with the users table if it doesn't exist."""
    conn = get_db_connection()
    try:
        # Create users table if it doesn't exist
        conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            is_admin BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        conn.commit()
        
        # Check if admin user exists, create if not
        admin_exists = conn.execute('SELECT COUNT(*) FROM users WHERE username = ?', ('administrator',)).fetchone()[0]
        if admin_exists == 0:
            # Generate a secure random password
            password = generate_secure_password()
            create_user('administrator', password, is_admin=True)
            print("\n" + "="*50)
            print("INITIAL ADMIN USER CREATED")
            print("Username: administrator")
            print(f"Password: {password}")
            print("Please change this password after first login")
            print("="*50 + "\n")
    finally:
        conn.close()

def generate_secure_password(length=12):
    """Generate a secure random password."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password

def create_user(username, password, email=None, is_admin=False):
    """Create a new user in the database."""
    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(password)
        conn.execute(
            'INSERT INTO users (username, password_hash, email, is_admin) VALUES (?, ?, ?, ?)',
            (username, password_hash, email, is_admin)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # Username already exists
        return False
    finally:
        conn.close()

def get_user_by_id(user_id):
    """Get a user by ID."""
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        return dict(user) if user else None
    finally:
        conn.close()

def get_user_by_username(username):
    """Get a user by username."""
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        return dict(user) if user else None
    finally:
        conn.close()

def authenticate_user(username, password):
    """Authenticate a user by username and password."""
    user = get_user_by_username(username)
    if user and check_password_hash(user['password_hash'], password):
        return user
    return None

def update_user(user_id, username=None, email=None, is_admin=None):
    """Update a user's information."""
    conn = get_db_connection()
    try:
        updates = []
        params = []
        
        if username is not None:
            updates.append('username = ?')
            params.append(username)
        
        if email is not None:
            updates.append('email = ?')
            params.append(email)
        
        if is_admin is not None:
            updates.append('is_admin = ?')
            params.append(is_admin)
        
        if not updates:
            return False
        
        query = f'UPDATE users SET {", ".join(updates)} WHERE id = ?'
        params.append(user_id)
        
        conn.execute(query, params)
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # Username already exists
        return False
    finally:
        conn.close()

def change_password(user_id, new_password):
    """Change a user's password."""
    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(new_password)
        conn.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            (password_hash, user_id)
        )
        conn.commit()
        return True
    finally:
        conn.close()

def delete_user(user_id):
    """Delete a user from the database."""
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def get_all_users():
    """Get all users from the database."""
    conn = get_db_connection()
    try:
        users = conn.execute('SELECT id, username, email, is_admin, created_at FROM users').fetchall()
        return [dict(user) for user in users]
    finally:
        conn.close()
