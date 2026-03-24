# ARCANE GRID — Guide de Déploiement Cloud
## Multijoueur via Internet (gratuit)

---

## 📁 Fichiers nécessaires

Dans votre dossier de déploiement, vous devez avoir **ces 3 fichiers** :

```
arcane-server.js      ← le serveur
morpion-magic.html    ← le jeu
package.json          ← dépendances Node.js
```

---

## 🚂 Option A — Railway (recommandé)

**Gratuit, démarrage en 5 minutes, WebSocket natif.**

### Étapes :

1. **Créez un compte** sur [railway.app](https://railway.app) (gratuit, connectez-vous avec GitHub)

2. **Créez un nouveau projet** → "Deploy from GitHub repo"  
   *OU* utilisez le CLI :
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

3. **Via GitHub (plus simple) :**
   - Créez un repo GitHub avec vos 3 fichiers
   - Sur Railway : New Project → Deploy from GitHub → sélectionnez votre repo
   - Railway détecte automatiquement Node.js et lance `npm start`

4. **Récupérez votre URL** dans Railway → Settings → Domains  
   Elle ressemble à : `https://arcane-grid-production.up.railway.app`

5. **Mettez à jour le client** dans `morpion-magic.html` :  
   Cherchez la fonction `mpGetServerUrl` et modifiez-la :
   ```javascript
   function mpGetServerUrl(){
     // URL de votre serveur Railway (remplacez par la vôtre)
     const CLOUD_SERVER = 'wss://arcane-grid-production.up.railway.app';
     // En local (même machine), connecte au serveur local
     if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
       return `ws://localhost:${location.port || 3000}`;
     }
     return CLOUD_SERVER;
   }
   ```

---

## 🎨 Option B — Render

**Gratuit (cold start de ~30s après inactivité).**

1. Créez un compte sur [render.com](https://render.com)

2. New → Web Service → connectez votre repo GitHub

3. Configurez :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node

4. Render vous donne une URL `https://arcane-grid.onrender.com`

5. Même modification de `mpGetServerUrl` que pour Railway.

---

## ⚡ Option C — Mode rapide avec ngrok (sans GitHub)

**Idéal pour tester immédiatement, sans déploiement.**  
Votre PC tourne le serveur, ngrok crée un tunnel public.

```bash
# 1. Installez ngrok : https://ngrok.com/download
# 2. Lancez votre serveur local
node arcane-server.js

# 3. Dans un autre terminal, créez le tunnel
ngrok http 3000

# 4. Ngrok affiche une URL publique comme :
#    https://abc123.ngrok-free.app
# 5. Partagez cette URL — elle fonctionne depuis n'importe où !
```

> ⚠️ Avec ngrok gratuit, l'URL change à chaque redémarrage.

---

## 🔧 Modification du client après déploiement cloud

Une fois votre serveur déployé, modifiez `mpGetServerUrl()` dans `morpion-magic.html` :

```javascript
function mpGetServerUrl(){
  const CLOUD_SERVER = 'wss://VOTRE-URL.up.railway.app'; // ← votre URL ici
  if (location.hostname === 'localhost' || location.hostname.match(/^192\.168\.|^10\./)) {
    // Réseau local → serveur local
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.hostname}:${location.port || 3000}`;
  }
  return CLOUD_SERVER;
}
```

---

## 🎮 Comment jouer une fois déployé

1. Les deux joueurs ouvrent `https://votre-url.railway.app` dans leur navigateur
2. Onglet **🌐 Multijoueur**
3. Joueur 1 : "Créer une partie" → reçoit un code à 6 lettres (ex: `ARC4NE`)
4. Joueur 2 : "Rejoindre" → entre le code
5. Joueur 1 : "Lancer la partie" → c'est parti !

---

## ❓ Problèmes courants

| Problème | Solution |
|----------|----------|
| "Serveur introuvable" | Vérifiez l'URL dans `mpGetServerUrl()` |
| WebSocket bloqué | Votre hébergeur supporte-t-il WSS ? (Railway et Render : oui) |
| Cold start lent (Render) | Normal, 30s au premier accès après inactivité |
| URL `ws://` bloquée en HTTPS | Utilisez `wss://` (le serveur supporte les deux) |
