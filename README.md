# UIPATHDLE

Jeu web façon "Wordle" autour des activités UiPath : chaque jour, il faut deviner une activité UiPath parmi une base de données enrichie (nom, package, catégorie, type, entrées/sorties...), avec un système d'indices, de tentatives limitées et de progression par manches.

Inclut également un scraper qui construit et enrichit la base de données d'activités UiPath (via un modèle Mistral) utilisée par le jeu.

## Stack

- React + TypeScript, Vite, Tailwind CSS
- Python (scraper de données, `Scrapper/`)

## Structure

- `src/UIPATHDLE.tsx` — logique et interface du jeu
- `Scrapper/` — scripts de collecte et d'enrichissement des données d'activités UiPath

## Usage

```bash
npm install
npm run dev
```
