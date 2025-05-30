#!/usr/bin/env python
"""
Script qui exécute Demucs avec l'environnement FFmpeg correctement configuré.
Ceci est appelé directement par stems_extractor.py.
"""
import os
import sys
import subprocess
import argparse

def main():
    # Configurez FFmpeg correctement à partir des arguments
    ffmpeg_path = sys.argv[1]
    ffmpeg_dir = os.path.dirname(ffmpeg_path)
    
    # Modifiez l'environnement pour Demucs
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    os.environ["FFMPEG_PATH"] = ffmpeg_path
    
    # Exécutez Demucs avec les arguments restants (sans le premier argument qui est le chemin FFmpeg)
    demucs_args = sys.argv[2:]
    
    # Imprimer les informations de diagnostic
    print(f"wrap_demucs.py: FFmpeg path = {ffmpeg_path}")
    print(f"wrap_demucs.py: PATH = {os.environ['PATH']}")
    print(f"wrap_demucs.py: Running demucs with args: {demucs_args}")
    
    # Exécuter Demucs
    return_code = subprocess.call([sys.executable, "-m", "demucs.separate"] + demucs_args)
    
    # Retourner le même code de sortie
    sys.exit(return_code)

if __name__ == "__main__":
    main()
