import os
import json
import xml.etree.ElementTree as ET
import re
import glob

# --- CONFIGURATION ---
# CORRECTION : Chemin spécifique vers votre dossier utilisateur "DELOS thomas"
NUGET_PATH = os.path.expanduser(r"~\.nuget\packages")

# Fichier de sortie
OUTPUT_FILE = r"C:\Users\tdelos\OneDrive - LYRECO MANAGEMENT\Documents\Perso\UIPATHDLE\Scrapper\uipath_activities_full.json"

# Packages à ignorer
IGNORE_PACKAGES = ["uipath.telemetry", "uipath.settings", "uipath.platform", "uipath.analyzers"]

def get_latest_version_path(package_path):
    """Trouve le dossier de la version la plus récente d'un package"""
    try:
        versions = [d for d in os.listdir(package_path) if os.path.isdir(os.path.join(package_path, d))]
        if not versions:
            return None
        # Tri simple (pourrait être amélioré avec packaging.version, mais suffisant ici)
        versions.sort(reverse=True)
        return os.path.join(package_path, versions[0])
    except Exception:
        return None

def find_xml_documentation(version_path):
    """Cherche le fichier .xml dans le dossier lib (net45, net6.0, etc.)"""
    for root, dirs, files in os.walk(version_path):
        for file in files:
            # Recherche insensible à la casse
            if file.lower().endswith(".xml") and "uipath" in file.lower() and "activities" in file.lower():
                return os.path.join(root, file)
    return None

def clean_activity_name(type_name):
    """Nettoie le nom technique (ex: T:UiPath.Core.Activities.Assign -> Assign)"""
    clean = type_name.split(':')[-1]
    name = clean.split('.')[-1]
    
    if name.endswith("Activity"):
        name = name[:-8]
    
    # Séparer le CamelCase
    name = re.sub(r'(?<!^)(?=[A-Z])', ' ', name)
    return name

def parse_xml_doc(xml_path, package_name):
    """Extrait les activités du fichier XML de documentation .NET"""
    activities = []
    
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        members = root.findall("./members/member")
        properties_count = {}
        
        # 1. Compter les propriétés
        for member in members:
            name_attr = member.get("name")
            if name_attr and name_attr.startswith("P:"):
                parent_class = ".".join(name_attr.split('.')[:-1]).replace("P:", "T:")
                properties_count[parent_class] = properties_count.get(parent_class, 0) + 1

        # 2. Scanner les activités
        for member in members:
            name_attr = member.get("name")
            
            if name_attr and name_attr.startswith("T:") and "Activities" in name_attr and not "Design" in name_attr:
                
                # --- FILTRE TECHNIQUE ---
                # Récupérer le nom de la classe brute (ex: IExcelService)
                raw_class_name = name_attr.split('.')[-1]
                
                # Règle C# : Une classe qui commence par 'I' suivi d'une Majuscule est une Interface interne
                # Ex: "IExcelService" (I + E) -> Rejeté
                if len(raw_class_name) > 1 and raw_class_name.startswith('I') and raw_class_name[1].isupper():
                    continue
                # ------------------------

                activity_name = clean_activity_name(name_attr)
                
                if "Factory" in activity_name or ("Scope" in activity_name and len(activity_name) > 30):
                    continue
                if "<" in name_attr or "I" == activity_name[0] and activity_name[1].isupper(): # Interfaces (Sécurité double)
                    continue

                summary = member.find("summary")
                description = "Pas de description."
                if summary is not None:
                    raw_desc = "".join(summary.itertext())
                    description = re.sub(r'\s+', ' ', raw_desc).strip()

                complexity = properties_count.get(name_attr, 1)

                category = "General"
                pkg_lower = package_name.lower()
                if "excel" in pkg_lower: category = "Excel"
                elif "mail" in pkg_lower: category = "Mail"
                elif "system" in pkg_lower: category = "System"
                elif "ui" in pkg_lower: category = "UI"
                elif "pdf" in pkg_lower: category = "PDF"
                
                act_type = "Action"
                if any(x in activity_name.lower() for x in ["scope", "container", "each", "trigger"]):
                    act_type = "Container"
                elif any(x in activity_name.lower() for x in ["get", "read", "exists", "check"]):
                    act_type = "Read"

                activities.append({
                    "name": activity_name,
                    "package": package_name.replace("UiPath.", "").replace(".Activities", ""),
                    "category": category,
                    "type": act_type,
                    "input": "Variable/Target",
                    "output": "Result",
                    "year": complexity,
                    "docUrl": "Local",
                    "description": description,
                    "icon": "default_icon",
                    "keywords": list(set([w for w in activity_name.split() if len(w) > 2] + [category, "UiPath"])),
                    "rebus": "❓ ❓ ❓ ❓ ❓" 
                })

    except Exception as e:
        # print(f"   ⚠️ Erreur lecture XML {xml_path}: {e}")
        pass
        
    return activities

def main():
    print(f"📂 Recherche des packages dans : {NUGET_PATH}")
    
    if not os.path.exists(NUGET_PATH):
        print(f"❌ Dossier NuGet introuvable : {NUGET_PATH}")
        return

    all_activities = []
    
    try:
        packages = [d for d in os.listdir(NUGET_PATH) if os.path.isdir(os.path.join(NUGET_PATH, d))]
        print(f"   ℹ️  {len(packages)} dossiers trouvés au total.")
    except Exception as e:
        print(f"❌ Erreur accès dossier: {e}")
        return

    for pkg in packages:
        pkg_lower = pkg.lower()
        # Filtre insensible à la casse
        if pkg_lower.startswith("uipath.") and ".activities" in pkg_lower and pkg_lower not in IGNORE_PACKAGES:
            
            pkg_path = os.path.join(NUGET_PATH, pkg)
            latest_version_path = get_latest_version_path(pkg_path)
            
            if latest_version_path:
                print(f"📦 Analyse de {pkg}...", end=" ")
                
                xml_file = find_xml_documentation(latest_version_path)
                
                if xml_file:
                    extracted = parse_xml_doc(xml_file, pkg)
                    if extracted:
                        print(f"✅ {len(extracted)} activités.")
                        all_activities.extend(extracted)
                    else:
                        print("⚠️ XML vide.")
                else:
                    print("⚠️ Pas de XML.")
    
    # Nettoyage doublons
    unique_activities = {act['name']: act for act in all_activities}.values()
    final_list = list(unique_activities)
    
    for i, act in enumerate(final_list):
        act['id'] = i + 1

    if final_list:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(final_list, f, indent=2, ensure_ascii=False)
        print(f"\n🎉 SUCCÈS ! {len(final_list)} activités extraites localement.")
        print(f"📁 Fichier : {OUTPUT_FILE}")
    else:
        print("\n😔 Aucune activité trouvée.")

if __name__ == "__main__":
    main()