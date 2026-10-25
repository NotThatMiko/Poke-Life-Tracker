# Poke-Life-Tracker

Habit tracker (frontend + API) with a PostgreSQL database.

## Hébergement

L'application complète nécessite un serveur Node.js et une base PostgreSQL.
GitHub Pages héberge uniquement des fichiers statiques : il ne peut pas exécuter
l'API, gérer les comptes ou stocker les données PostgreSQL.
Le déploiement Docker ci-dessous permet d'héberger l'application complète.

## Ce qu'il faut pour la synchro téléphone + homelab

La synchro est simple: il faut **une seule instance centrale** (sur le homelab) avec **une base PostgreSQL persistante**.

- Le PC et le téléphone ouvrent la **même URL**
- Les deux utilisent la **même API** et la **même base**
- Les changements apparaissent sur tous les appareils au prochain refresh

## Lancement rapide (Docker Compose)

```bash
docker compose up -d --build
```

L'application sera disponible sur `http://<ip-du-homelab>:5000`.

## Accès depuis le téléphone

- Sur le même Wi-Fi: ouvrir `http://<ip-du-homelab>:5000`
- Depuis l'extérieur: utiliser un reverse proxy + HTTPS, ou un VPN (ex: Tailscale)
- Tu peux ensuite l'ajouter à l'écran d'accueil (Safari/Chrome)

## Important sécurité

Cette app n'a pas d'authentification intégrée pour l'instant.

- Ne pas l'exposer directement sur Internet sans protection
- Recommandé: Tailscale, ou reverse proxy avec auth (Authelia / basic auth / SSO)

## Variables d'environnement

- `DATABASE_URL`: connexion PostgreSQL
- `PORT`: port HTTP de l'app (par défaut `5000`)
- `SEED_DEMO_DATA`: `true` pour injecter des données de démo au démarrage (par défaut `false` en prod)

## Développement local (sans Docker)

1. Lancer PostgreSQL
2. Configurer `DATABASE_URL`
3. Appliquer le schéma:

```bash
npm run db:push
```

4. Démarrer:

```bash
npm run dev
```
