import os
import sys
import types
import importlib
import pytest

# Fixture to create Flask test client with necessary patches
@pytest.fixture
def client(monkeypatch):
    # Stub out heavy optional dependencies to allow importing the app
    stub = types.ModuleType('stub')
    monkeypatch.setitem(sys.modules, 'dotenv', stub)
    monkeypatch.setitem(sys.modules, 'flask_socketio', stub)
    monkeypatch.setitem(sys.modules, 'flask_session', stub)
    monkeypatch.setitem(sys.modules, 'numpy', stub)
    monkeypatch.setitem(sys.modules, 'torch', stub)
    monkeypatch.setitem(sys.modules, 'torchaudio', stub)
    monkeypatch.setitem(sys.modules, 'demucs', stub)
    monkeypatch.setitem(sys.modules, 'aiotube', stub)
    monkeypatch.setitem(sys.modules, 'requests', stub)
    monkeypatch.setitem(sys.modules, 'bs4', stub)

    import core.config
    monkeypatch.setattr(core.config, 'ensure_ffmpeg_available', lambda: True)

    app_module = importlib.import_module('app')
    app_module.app.config['TESTING'] = True
    return app_module.app.test_client()


def test_download_file_via_client(client):
    sample_path = os.path.join(os.path.dirname(__file__), 'data', 'sample.txt')
    response = client.get('/api/download/file', query_string={'path': sample_path})
    assert response.status_code == 200
    with open(sample_path, 'rb') as f:
        assert response.data == f.read()


def test_download_file_direct(client):
    sample_path = os.path.join(os.path.dirname(__file__), 'data', 'sample.txt')
    app = client.application
    with app.test_request_context('/api/download-file', query_string={'file_path': sample_path}):
        # Call the underlying view function directly to bypass decorators
        resp = app.view_functions['download_file_route'].__wrapped__()
        assert resp.status_code == 200
        with open(sample_path, 'rb') as f:
            assert resp.data == f.read()
