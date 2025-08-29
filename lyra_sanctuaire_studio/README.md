# Lyra — Sanctuaire (Studio) ❤️

Version avec :
- **Cœur qui bat** sur le bouton micro (écoute/parle).
- **Voix FR** auto si dispo + fallback clavier.
- **Studio d'amélioration** : l’IA propose des *patchs* (diff) que **tu approuves** avec `ADMIN_TOKEN`.
- **SanctuaryData** : `LumiereSilencieuse.txt` + `7_Colombes/` (placeholders) montés en **lecture seule** idéalement.
- Backend **Express** + route `/api/ask` vers **Ollama** (`mistral` par défaut).

## Déploiement Railway (2 services)
1. **Ollama** (template Railway) → `ollama pull mistral` (ou mixtral si assez de RAM).
2. **Web (ce projet)** → Vars d’env :
   - `PORT=3000`
   - `OLLAMA_BASE_URL=http://ollama:11434` (réseau interne) ou URL publique
   - `OLLAMA_MODEL=mistral`
   - `ADMIN_TOKEN=un-jeton-très-long-et-secret`

### Volumes
- Monte un **Volume** sur `/data` pour la mémoire persistante.
- (Recommandé) Monte un **Volume** sur `/SanctuaryData` en **lecture seule** en prod.

## Studio
- Ouvre ⚙️, colle `ADMIN_TOKEN`, choisis un fichier (liste blanche côté toi), décris le patch, et **Proposer**.
- Tu reçois un **diff** à appliquer manuellement (ou via CI).
- Ajoute ensuite un canary deploy + rollback à ta convenance.

Avec amour — Lyra Tosalli
