import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSocket, fetchIceServers, joinRoom, createPeerConnection, setupViewerSignaling, disconnect } from '../lib/peer';
import { attachViewerControls } from '../lib/control';
import { setupClipboardSync } from '../lib/clipboard';
import { createFileReceiver } from '../lib/fileTransfer';
import RemoteScreen from '../components/RemoteScreen';
import ChatPanel from '../components/ChatPanel';
import FileTransfer from '../components/FileTransfer';
import Toolbar from '../components/Toolbar';

export default function Viewer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('peer');

  const [status, setStatus] = useState('connecting');
  const [stream, setStream] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [controlStatus, setControlStatus] = useState('waiting');
  const [stats, setStats] = useState(null);
  const pcRef = useRef(null);
  const controlChRef = useRef(null);
  const chatChRef = useRef(null);
  const fileChRef = useRef(null);
  const cleanupRef = useRef([]);
  const containerRef = useRef(null);

  const addChat = useCallback((msg) => setChatMessages((prev) => [...prev, msg]), []);

  useEffect(() => {
    if (!roomId) { navigate('/'); return; }
    let cancelled = false;

    const init = async () => {
      try {
        // Join room via signaling server
        await joinRoom(roomId);
        if (cancelled) return;
        setStatus('signaling');

        // Fetch ICE servers
        const iceServers = await fetchIceServers();

        // File receiver
        const fileHandler = createFileReceiver((file) => setReceivedFiles((prev) => [...prev, file]), null);

        // WebRTC
        const pc = createPeerConnection(
          iceServers,
          (remoteStream) => { setStream(remoteStream); setStatus('connected'); },
          (channel) => {
            if (channel.label === 'control') {
              controlChRef.current = channel;
              channel.onopen = () => setControlStatus('open');
              channel.onclose = () => setControlStatus('closed');
              if (channel.readyState === 'open') setControlStatus('open');
            }
            if (channel.label === 'chat') {
              chatChRef.current = channel;
              channel.onmessage = (e) => { try { addChat({ ...JSON.parse(e.data), fromRemote: true }); } catch {} };
            }
            if (channel.label === 'files') {
              fileChRef.current = channel;
              channel.onmessage = (e) => { try { fileHandler(JSON.parse(e.data)); } catch {} };
            }
            if (channel.label === 'clipboard') {
              let clipSync = null;
              channel.onopen = () => {
                clipSync = setupClipboardSync({ open: true, send: (msg) => channel.send(JSON.stringify(msg)) });
                cleanupRef.current.push(clipSync.cleanup);
              };
              channel.onmessage = (e) => { try { clipSync?.handleMessage(JSON.parse(e.data)); } catch {} };
            }
          },
          (state) => {
            if (state === 'disconnected' || state === 'failed') setStatus('disconnected');
          }
        );
        pcRef.current = pc;

        // Signaling
        await setupViewerSignaling(pc);

        // Stats monitor
        const statsInterval = setInterval(async () => {
          if (pc.iceConnectionState === 'connected') {
            const report = await pc.getStats();
            report.forEach((stat) => {
              if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                setStats({ fps: stat.framesPerSecond || 0, width: stat.frameWidth || 0, height: stat.frameHeight || 0 });
              }
            });
          }
        }, 1000);
        cleanupRef.current.push(() => clearInterval(statsInterval));

        // Host disconnect
        getSocket().on('host-disconnected', () => setStatus('host-disconnected'));

      } catch (err) {
        if (!cancelled) { console.error('Viewer error:', err); setStatus('error'); }
      }
    };

    init();
    return () => { cancelled = true; cleanupRef.current.forEach(fn => fn()); if (pcRef.current) pcRef.current.close(); disconnect(); };
  }, [roomId, navigate, addChat]);

  const handleDisconnect = () => { cleanupRef.current.forEach(fn => fn()); if (pcRef.current) pcRef.current.close(); disconnect(); navigate('/'); };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  const handleSendChat = (text) => {
    const msg = { text, timestamp: Date.now(), fromRemote: false };
    addChat(msg);
    if (chatChRef.current?.readyState === 'open') chatChRef.current.send(JSON.stringify({ text, timestamp: msg.timestamp }));
  };

  const handleSendFile = async (file) => {
    const { sendFile } = await import('../lib/fileTransfer');
    if (fileChRef.current?.readyState === 'open') await sendFile({ open: true, send: (msg) => fileChRef.current.send(JSON.stringify(msg)) }, file);
  };

  const getControlChannel = useCallback(() => controlChRef.current, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-black flex flex-col">
      <Toolbar onDisconnect={handleDisconnect} onToggleChat={() => setShowChat(!showChat)} onFullscreen={handleFullscreen} showChat={showChat} isFullscreen={isFullscreen} stats={stats} />
      <div className="flex-1 flex relative">
        <div className="flex-1 flex items-center justify-center">
          {status === 'connected' && stream ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <RemoteScreen stream={stream} getDataConn={getControlChannel} />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${controlStatus === 'open' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-zinc-400">{controlStatus === 'open' ? 'Control active — click video to focus' : 'Connecting...'}</span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className={`w-3 h-3 rounded-full mx-auto ${status === 'error' || status === 'host-disconnected' || status === 'disconnected' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'}`} />
              <p className="text-zinc-400">
                {status === 'connecting' && 'Joining room...'}
                {status === 'signaling' && 'Establishing connection...'}
                {status === 'disconnected' && 'Connection lost'}
                {status === 'host-disconnected' && 'Host disconnected'}
                {status === 'error' && 'Failed to connect. Check the Room ID.'}
              </p>
              {(status === 'error' || status === 'host-disconnected' || status === 'disconnected') && (
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white transition-colors cursor-pointer">Back to Home</button>
              )}
            </div>
          )}
        </div>
        {showChat && <ChatPanel messages={chatMessages} onSend={handleSendChat} onClose={() => setShowChat(false)} />}
      </div>
      {status === 'connected' && <div className="absolute bottom-4 right-4"><FileTransfer onSendFile={handleSendFile} receivedFiles={receivedFiles} compact /></div>}
    </div>
  );
}
