import os
import sqlite3
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), 'processed.db')


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _get_conn()
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS downloads (video_id TEXT PRIMARY KEY, file_path TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS extractions (audio_hash TEXT PRIMARY KEY, output_dir TEXT)")
        conn.commit()
    finally:
        conn.close()


# --------- Download helpers ---------

def get_download_path(video_id: str) -> Optional[str]:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT file_path FROM downloads WHERE video_id=?", (video_id,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def save_download_path(video_id: str, file_path: str):
    conn = _get_conn()
    try:
        conn.execute("REPLACE INTO downloads (video_id, file_path) VALUES (?, ?)", (video_id, file_path))
        conn.commit()
    finally:
        conn.close()


def remove_download(video_id: str):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM downloads WHERE video_id=?", (video_id,))
        conn.commit()
    finally:
        conn.close()


# --------- Extraction helpers ---------

def get_extraction_dir(audio_hash: str) -> Optional[str]:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT output_dir FROM extractions WHERE audio_hash=?", (audio_hash,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def save_extraction_dir(audio_hash: str, output_dir: str):
    conn = _get_conn()
    try:
        conn.execute("REPLACE INTO extractions (audio_hash, output_dir) VALUES (?, ?)", (audio_hash, output_dir))
        conn.commit()
    finally:
        conn.close()


def remove_extraction(audio_hash: str):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM extractions WHERE audio_hash=?", (audio_hash,))
        conn.commit()
    finally:
        conn.close()


# Initialize database on module load
init_db()
