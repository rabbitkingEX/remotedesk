import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3200;
const TURN_DOMAIN = process.env.TURN_DOMAIN || 'localhost';
const TURN_SECRET = process.env.TURN_SECRET || 'remotedesk_turn_secret';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket'],
});

// Serve built frontend
app.use(express.static(join(__dirname, '..', 'dist')));

// API: return ICE servers with TURN credentials
import crypto from 'crypto';

app.get('/api/ice-servers', (req, res) => {
  // Generate time-limited TURN credentials (coturn REST API style)
  const ttl = 86400; // 24 hours
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:remotedesk`;

  const hmac = crypto.createHmac('sha1', TURN_SECRET);
  hmac.update(username);
  const credential = hmac.digest('base64');

  res.json([
    { urls: `stun:${TURN_DOMAIN}:3478` },
    { urls: `turn:${TURN_DOMAIN}:3478`, username, credential },
    { urls: `turn:${TURN_DOMAIN}:3478?transport=tcp`, username, credential },
    { urls: `turns:${TURN_DOMAIN}:5349`, username, credential },
  ]);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

// Signaling
const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('create-room', (callback) => {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    rooms.set(id, { hostSocketId: socket.id, viewerSocketId: null });
    socket.join(id);
    callback({ id });
  });

  socket.on('join-room', ({ id }, callback) => {
    const room = rooms.get(id);
    if (!room) { callback({ error: 'Room not found' }); return; }
    if (room.viewerSocketId) { callback({ error: 'Room is full' }); return; }
    room.viewerSocketId = socket.id;
    socket.join(id);
    io.to(room.hostSocketId).emit('viewer-joined', { viewerSocketId: socket.id });
    callback({ success: true });
  });

  socket.on('signal-offer', ({ offer }) => {
    const room = findRoomBySocket(socket.id);
    if (room?.viewerSocketId) io.to(room.viewerSocketId).emit('signal-offer', { offer });
  });

  socket.on('signal-answer', ({ answer }) => {
    const room = findRoomBySocket(socket.id);
    if (room) io.to(room.hostSocketId).emit('signal-answer', { answer });
  });

  socket.on('signal-ice', ({ candidate }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const target = socket.id === room.hostSocketId ? room.viewerSocketId : room.hostSocketId;
    if (target) io.to(target).emit('signal-ice', { candidate });
  });

  socket.on('disconnect', () => {
    for (const [id, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        if (room.viewerSocketId) io.to(room.viewerSocketId).emit('host-disconnected');
        rooms.delete(id);
        return;
      }
      if (room.viewerSocketId === socket.id) {
        io.to(room.hostSocketId).emit('viewer-disconnected');
        room.viewerSocketId = null;
        return;
      }
    }
  });
});

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId || room.viewerSocketId === socketId) return room;
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`RemoteDesk server running on port ${PORT}`);
});
