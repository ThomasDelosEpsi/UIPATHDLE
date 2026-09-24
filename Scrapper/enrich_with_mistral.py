import json
import time
import requests
import os
import urllib3
import random
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# Désactiver les avertissements de sécurité SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- CONFIGURATION ---
INPUT_FILE = r"C:\Users\tdelos\OneDrive - LYRECO MANAGEMENT\Documents\Perso\UIPATHDLE\Scrapper\uipath_activities_full.json"
OUTPUT_FILE = r"C:\Users\tdelos\OneDrive - LYRECO MANAGEMENT\Documents\Perso\UIPATHDLE\Scrapper\uipath_activities_enriched.json"

MISTRAL_API_KEY = os.environ["MISTRAL_API_KEY"]
MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions"
MODEL = "mistral-small"
MAX_WORKERS = 2  # RÉDUIT à 2 pour éviter les 429 trop fréquents

PROXIES = {
    "http": "http://proxy.lyreco.com:8080",
    "https": "http://proxy.lyreco.com:8080",
}

# Verrous pour gérer les accès concurrents (affichage et fichier)
print_lock = threading.Lock()
save_lock = threading.Lock()

def enrich_data_with_mistral(activity):
    """
    Fonction exécutée par chaque thread.
    Gère les retries automatiques en cas de 429 (Rate Limit).
    """
    # Petit délai aléatoire initial
    time.sleep(random.uniform(0.5, 1.5))
    
    prompt = f"""
    Génère des métadonnées pour l'activité UiPath : "{activity.get('name')}".
    Description : "{activity.get('description')}".

    TÂCHES :
    1. 'rebus_variations': Crée 3 listes d'émojis (5 émojis par liste, séparés par un espace) qui décrivent CETTE activité spécifique.
       - Interdit d'utiliser toujours les mêmes émojis génériques.
       - Essaie d'être drôle ou conceptuel.
       - Exemple pour 'Send Mail' : "📧 ➡️ 🌐 📬 ✅"
       - Exemple pour 'Click' : "🖱️ 👇 🔘 💥 ✨"
    
    2. 'keywords': 4 mots-clés techniques anglais uniques à cette activité.

    3. Complète 'input', 'output', 'type' et 'description' (en français) si vide.

    FORMAT JSON ATTENDU :
    {{
      "description": "...",
      "input": "...",
      "output": "...",
      "type": "Action",
      "keywords": ["...", "..."],
      "rebus_variations": [
         "EMOJI1 EMOJI2 EMOJI3 EMOJI4 EMOJI5", 
         "EMOJI1 EMOJI2 EMOJI3 EMOJI4 EMOJI5", 
         "EMOJI1 EMOJI2 EMOJI3 EMOJI4 EMOJI5"
      ]
    }}
    """
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MISTRAL_API_KEY}"
    }
    
    data = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.9,
        "response_format": {"type": "json_object"}
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(MISTRAL_ENDPOINT, headers=headers, json=data, proxies=PROXIES, verify=False, timeout=30)
            
            if response.status_code == 200:
                content = response.json()['choices'][0]['message']['content']
                return json.loads(content)
            
            elif response.status_code == 429:
                wait_time = (attempt + 1) * 5  # Attente progressive : 5s, 10s, 15s
                with print_lock:
                    print(f" ⏳ Rate Limit (429) pour {activity.get('name')}. Pause de {wait_time}s avant retry ({attempt+1}/{max_retries})...")
                time.sleep(wait_time)
                continue # On retente la boucle
            
            else:
                with print_lock:
                    print(f" ❌ Erreur API {response.status_code} pour {activity.get('name')}")
                return None # Erreur non récupérable (ex: 401, 500)
                
        except Exception as e:
            with print_lock:
                print(f" 💥 Exception connexion pour {activity.get('name')}: {e}")
            return None

    with print_lock:
        print(f" 💀 Abandon après {max_retries} tentatives pour {activity.get('name')}")
    return None

def save_activities(activities):
    """Sauvegarde thread-safe"""
    with save_lock:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(activities, f, indent=2, ensure_ascii=False)

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Fichier d'entrée introuvable : {INPUT_FILE}")
        return

    # 1. Charger les activités brutes
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        activities = json.load(f)

    # 2. Charger les activités DÉJÀ traitées
    processed_map = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
                for item in existing_data:
                    if "name" in item:
                        processed_map[item["name"]] = item
            print(f"📂 Fichier de sortie chargé : {len(processed_map)} activités en base.")
        except Exception:
            pass

    # 3. Préparer le travail
    indices_to_process = []
    skipped_count = 0

    print("🔍 Analyse des tâches...")
    for i, activity in enumerate(activities):
        name = activity.get("name")
        should_process = True
        
        if name in processed_map:
            existing_item = processed_map[name]
            
            has_keywords = bool(existing_item.get("keywords"))
            has_rebus = bool(existing_item.get("rebus_variations"))
            
            # Vérif Bug Rebus
            current_rebus = existing_item.get("rebus_variations", [])
            is_bad_rebus = False
            if current_rebus and len(current_rebus) > 0:
                 if "🖱️" in current_rebus[0] and "👆" in current_rebus[0] and name != "Click":
                     is_bad_rebus = True

            if has_keywords and has_rebus and not is_bad_rebus:
                activity.update(existing_item)
                skipped_count += 1
                should_process = False

        if should_process:
            indices_to_process.append(i)

    print(f"📊 Bilan initial : {skipped_count} ignorés (déjà faits), {len(indices_to_process)} à traiter.")
    print(f"🚀 Lancement du multithreading ({MAX_WORKERS} workers) avec gestion des retries...")

    updated_count = 0
    
    # 4. Lancement des threads
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_index = {
            executor.submit(enrich_data_with_mistral, activities[i]): i 
            for i in indices_to_process
        }

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            activity_name = activities[idx].get("name")
            
            try:
                ai_data = future.result()
                if ai_data:
                    activities[idx].update(ai_data)
                    updated_count += 1
                    
                    with print_lock:
                        print(f" ✅ [{updated_count}/{len(indices_to_process)}] {activity_name}")

                    if updated_count % 5 == 0:
                        save_activities(activities)
                else:
                    with print_lock:
                        print(f" ⚠️  Échec définitif pour {activity_name}")
            except Exception as e:
                with print_lock:
                    print(f" 💥 Erreur fatale sur {activity_name}: {e}")

    save_activities(activities)
    print(f"\n✅ Terminé ! {updated_count} activités traitées.")

if __name__ == "__main__":
    main()