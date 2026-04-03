import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPeer, destroyPeer } from '../lib/peer';
import { setupClipboardSync } from '../lib/clipboard';
import { createFileReceiver } from '../lib/fileTransfer';
import RemoteScreen from '../components/RemoteScreen';
import ChatPanel from '../components/ChatPanel';
import FileTransfer from '../components/FileTransfer';
import Toolbar from '../components/Toolbar';

export default function Viewer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hostPeerId = searchParams.get('peer');

  const [status, setStatus] = useState('connecting');
  const [stream, setStream] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [controlStatus, setControlStatus] = useState('waiting');
  const [stats, setStats] = useState(null);
  const peerRef = useRef(null);
  const dataConnRef = useRef(null);
  const mediaConnRef = useRef(null);
  const cleanupRef = useRef([]);
  const containerRef = useRef(null);

  const addChat = useCallback((msg) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!hostPeerId) { navigate('/'); return; }

    let cancelled = false;

    const init = async () => {
      try {
        // Create our own peer
        const { peer } = await createPeer();
        if (cancelled) { peer.destroy(); return; }
        peerRef.current = peer;

        // File receiver
        const fileHandler = createFileReceiver(
          (file) => setReceivedFiles((prev) => [...prev, file]),
          null
        );

        // Clipboard sync
        let clipSync = null;

        // Open data connection to host
        const dataConn = peer.connect(hostPeerId, { reliable: true });
        dataConnRef.current = dataConn;

        dataConn.on('open', () => {
          setControlStatus('open');
          clipSync = setupClipboardSync(dataConn);
          cleanupRef.current.push(clipSync.cleanup);
        });

        dataConn.on('data', (msg) => {
          if (msg.ch === 'chat') {
            addChat({ ...msg, fromRemote: true });
          } else if (msg.ch === 'file') {
            fileHandler(msg);
          } else if (msg.ch === 'clip') {
            clipSync?.handleMessage(msg);
          }
        });

        dataConn.on('close', () => {
          setControlStatus('closed');
          setStatus('disconnected');
        });

        // Call host with a dummy stream (PeerJS requires a stream to call)
        // We just need to receive the host's screen stream
        const dummyStream = new MediaStream();
        const call = peer.call(hostPeerId, dummyStream);
        mediaConnRef.current = call;

        call.on('stream', (remoteStream) => {
          setStream(remoteStream);
          setStatus('connected');

          // Set low-latency jitter buffer
          const receivers = call.peerConnection?.getReceivers() || [];
          receivers.forEach(r => {
            if (r.track?.kind === 'video') {
              try {
                r.playoutDelayHint = 0;
                r.jitterBufferTarget = 0;
              } catch {}
            }
          });
        });

        call.on('close', () => {
          setStatus('disconnected');
        });

        call.on('error', (err) => {
          console.error('Call error:', err);
          setStatus('error');
        });

        // Monitor stats
        const statsInterval = setInterval(async () => {
          const pc = call.peerConnection;
          if (pc?.connectionState === 'connected') {
            const report = await pc.getStats();
            report.forEach((stat) => {
              if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                setStats({
                  fps: stat.framesPerSecond || 0,
                  width: stat.frameWidth || 0,
                  height: stat.frameHeight || 0,
                });
              }
            });
          }
        }, 1000);
        cleanupRef.current.push(() => clearInterval(statsInterval));

        peer.on('disconnected', () => {
          if (!peer.destroyed) peer.reconnect();
        });

      } catch (err) {
        if (!cancelled) {
          console.error('Viewer init error:', err);
          setStatus('error');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanupRef.current.forEach(fn => fn());
      destroyPeer(peerRef.current);
    };
  }, [hostPeerId, navigate, addChat]);

  const handleDisconnect = () => {
    cleanupRef.current.forEach(fn => fn());
    destroyPeer(peerRef.current);
    navigate('/');
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSendChat = (text) => {
    const msg = { text, timestamp: Date.now(), fromRemote: false };
    addChat(msg);
    const dc = dataConnRef.current;
    if (dc?.open) dc.send({ ch: 'chat', text, timestamp: msg.timestamp });
  };

  const handleSendFile = async (file) => {
    const { sendFile } = await import('../lib/fileTransfer');
    const dc = dataConnRef.current;
    if (dc?.open) await sendFile(dc, file);
  };

  const getDataConn = useCallback(() => dataConnRef.current, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-black flex flex-col">
      <Toolbar
        onDisconnect={handleDisconnect}
        onToggleChat={() => setShowChat(!showChat)}
        onFullscreen={handleFullscreen}
        showChat={showChat}
        isFullscreen={isFullscreen}
        stats={stats}
      />

      <div className="flex-1 flex relative">
        <div className="flex-1 flex items-center justify-center">
          {status === 'connected' && stream ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <RemoteScreen stream={stream} getDataConn={getDataConn} />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${controlStatus === 'open' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-zinc-400">
                  {controlStatus === 'open' ? 'Control active — click video to focus' : 'Control channel connecting...'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className={`w-3 h-3 rounded-full mx-auto ${
                status === 'error' || status === 'disconnected' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
              }`} />
              <p className="text-zinc-400">
                {status === 'connecting' && 'Connecting to host...'}
                {status === 'disconnected' && 'Connection lost'}
                {status === 'error' && 'Failed to connect. Check the Peer ID.'}
              </p>
              {(status === 'error' || status === 'disconnected') && (
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white transition-colors cursor-pointer">
                  Back to Home
                </button>
              )}
            </div>
          )}
        </div>

        {showChat && (
          <ChatPanel messages={chatMessages} onSend={handleSendChat} onClose={() => setShowChat(false)} />
        )}
      </div>

      {status === 'connected' && (
        <div className="absolute bottom-4 right-4">
          <FileTransfer onSendFile={handleSendFile} receivedFiles={receivedFiles} compact />
        </div>
      )}
    </div>
  );
}
