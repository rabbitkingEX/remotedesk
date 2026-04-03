import { io } from 'socket.io-client';

let socket = null;
let iceServers = null;

export function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket'],
    });
  }
  return socket;
}

export async function fetchIceServers() {
  if (iceServers) return iceServers;
  try {
    const res = await fetch('/api/ice-servers');
    iceServers = await res.json();
    console.log('ICE servers loaded:', iceServers.length);
  } catch {
    iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
  }
  return iceServers;
}

export function createRoom() {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('create-room', (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res.id);
    });
  });
}

export function joinRoom(id) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('join-room', { id }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve();
    });
  });
}

export function createPeerConnection(iceServers, onTrack, onDataChannel, onStateChange) {
  const pc = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 4,
  });
  const s = getSocket();

  pc.onicecandidate = (e) => {
    if (e.candidate) s.emit('signal-ice', { candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    if (e.track.kind === 'video' && e.receiver) {
      try { e.receiver.playoutDelayHint = 0; e.receiver.jitterBufferTarget = 0; } catch {}
    }
    if (onTrack) onTrack(e.streams[0]);
  };

  pc.ondatachannel = (e) => {
    if (onDataChannel) onDataChannel(e.channel);
  };

  pc.oniceconnectionstatechange = () => {
    if (onStateChange) onStateChange(pc.iceConnectionState);
  };

  return pc;
}

export function setupHostSignaling(pc) {
  const s = getSocket();

  s.on('signal-answer', async ({ answer }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  s.on('signal-ice', async ({ candidate }) => {
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  });

  return new Promise((resolve) => {
    s.on('viewer-joined', async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      s.emit('signal-offer', { offer });
      resolve();
    });
  });
}

export function setupViewerSignaling(pc) {
  const s = getSocket();

  return new Promise((resolve) => {
    s.on('signal-offer', async ({ offer }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('signal-answer', { answer });
      resolve();
    });

    s.on('signal-ice', async ({ candidate }) => {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    });
  });
}

export function disconnect() {
  if (socket) { socket.disconnect(); socket = null; }
}
