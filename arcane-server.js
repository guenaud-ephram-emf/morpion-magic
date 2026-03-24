/**
 * ARCANE GRID — Serveur Multijoueur
 * ════════════════════════════════════════════════════════
 *
 * MODE LOCAL (réseau Wi-Fi) :
 *   npm install
 *   node arcane-server.js
 *   → ouvrez http://VOTRE_IP:3000
 *
 * MODE CLOUD (internet, gratuit) :
 *   → Déployez sur Railway ou Render (voir DEPLOY.md)
 *   → Le serveur écoute sur process.env.PORT automatiquement
 *
 * ════════════════════════════════════════════════════════
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

let WebSocketServer;
try {
  WebSocketServer = require('ws').WebSocketServer;
} catch (e) {
  console.error('\n╔══════════════════════════════════════════════╗');
  console.error('║  ❌  Module "ws" manquant !                  ║');
  console.error('╠══════════════════════════════════════════════╣');
  console.error('║  Exécutez d\'abord :  npm install             ║');
  console.error('╚══════════════════════════════════════════════╝\n');
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────
const PORT      = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'morpion-magic.html');
const IS_CLOUD  = !!process.env.RENDER || !!process.env.RAILWAY_ENVIRONMENT
                  || process.env.NODE_ENV === 'production';

// ── HTTP server ──────────────────────────────────────────
const httpServer = http.createServer((req, res) => {

  // Health check for cloud platforms
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Serve the game HTML
  if (req.url === '/' || req.url === '/index.html' || req.url === '/morpion-magic.html') {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('morpion-magic.html introuvable. Placez-le dans le même dossier que ce fichier.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ── WebSocket server ─────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// rooms[code] = { players: [ws1, ws2], hostName: '', createdAt: Date }
const rooms = new Map();

// Clean up empty rooms after 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function broadcast(room, msg, exclude = null) {
  const json = JSON.stringify(msg);
  room.players.forEach(ws => {
    if (ws !== exclude && ws.readyState === 1) ws.send(json);
  });
}

wss.on('connection', (ws, req) => {
  ws.roomCode  = null;
  ws.playerNum = null;
  ws.isAlive   = true;

  // Heartbeat — detect dead connections
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    // Size guard: ignore messages > 256 KB
    if (raw.length > 256 * 1024) return;

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create': {
        let code;
        do { code = generateCode(); } while (rooms.has(code));
        rooms.set(code, {
          players:   [ws],
          hostName:  msg.name || 'Joueur 1',
          createdAt: Date.now()
        });
        ws.roomCode  = code;
        ws.playerNum = 1;
        ws.send(JSON.stringify({ type: 'created', code, playerNum: 1 }));
        console.log(`[${code}] Créée par "${msg.name}" — ${rooms.size} partie(s) active(s)`);
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', msg: 'Code invalide ou partie introuvable.' }));
          return;
        }
        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', msg: 'La partie est déjà complète.' }));
          return;
        }
        room.players.push(ws);
        ws.roomCode  = code;
        ws.playerNum = 2;
        ws.send(JSON.stringify({ type: 'joined', code, playerNum: 2, hostName: room.hostName }));
        room.players[0].send(JSON.stringify({ type: 'opponent_joined', opponentName: msg.name || 'Joueur 2' }));
        console.log(`[${code}] "${msg.name}" a rejoint`);
        break;
      }

      case 'start': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, { type: 'start', names: msg.names });
        console.log(`[${ws.roomCode}] Partie démarrée`);
        break;
      }

      // ── Game messages — simple relay ─────────────────
      case 'action':
      case 'state_sync':
      case 'event_card':
      case 'fx': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, msg, ws); // relay as-is, excluding sender
        break;
      }

      case 'forfeit':
      case 'draw_request': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, { ...msg, playerNum: ws.playerNum }, ws);
        break;
      }

      case 'draw_response': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        broadcast(room, { type: 'draw_response', accepted: msg.accepted, playerNum: ws.playerNum }, ws);
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    broadcast(room, { type: 'opponent_left' }, ws);
    rooms.delete(ws.roomCode);
    console.log(`[${ws.roomCode}] Partie terminée (déconnexion) — ${rooms.size} partie(s) active(s)`);
  });

  ws.on('error', err => {
    console.error(`[WS] Erreur: ${err.message}`);
  });
});

// Heartbeat interval — ping all clients every 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ── Start ────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  if (IS_CLOUD) {
    console.log(`\n🌐 ARCANE GRID — Serveur Cloud démarré sur port ${PORT}`);
    console.log(`   Prêt à recevoir des connexions.\n`);
    return;
  }

  // Local mode: display LAN IPs
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips  = [];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       ARCANE GRID — Serveur Local            ║');
  console.log('╠══════════════════════════════════════════════╣');
  ips.forEach(ip => {
    const url = `http://${ip}:${PORT}`;
    const pad = ' '.repeat(Math.max(0, 44 - url.length));
    console.log(`║  ${url}${pad}║`);
  });
  if (ips.length === 0) {
    console.log(`║  http://localhost:${PORT}                         ║`);
  }
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Partagez l\'URL ci-dessus avec l\'adversaire. ║');
  console.log('║  Ctrl+C pour arrêter.                        ║');
  console.log('╚══════════════════════════════════════════════╝\n');
});
