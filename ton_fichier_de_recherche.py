print("DEBUG - Texte reçu pour parsing:", text)  # Ajout du log pour debug
match = re.search(pattern, text)
if match:
    result = match.group(1)
else:
    result = None
    print("DEBUG - Aucun match trouvé pour le pattern:", pattern)  # Log si échec
    # ou log l'erreur ici