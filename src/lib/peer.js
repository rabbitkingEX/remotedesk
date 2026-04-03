import Peer from 'peerjs';

// Generate a short readable ID
function generateId() {
  return 'rd-' + Math.random().toString(36).slice(2, 8);
}

export function createPeer(customId) {
  return new Promise((resolve, reject) => {
    const id = customId || generateId();
    const peer = new Peer(id, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peer.on('open', (peerId) => resolve({ peer, peerId }));
    peer.on('error', (err) => {
      // ID taken — retry with a new one
      if (err.type === 'unavailable-id') {
        peer.destroy();
        createPeer().then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    // Timeout
    setTimeout(() => reject(new Error('PeerJS connection timeout')), 15000);
  });
}

export function destroyPeer(peer) {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
}
