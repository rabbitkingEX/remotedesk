import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPeer, destroyPeer } from '../lib/peer';
import { forwardControlToAgent, connectInputAgent, sendScreenConfig } from '../lib/control';
import { setupClipboardSync } from '../lib/clipboard';
import { createFileReceiver } from '../lib/fileTransfer';
import ConnectionInfo from '../components/ConnectionInfo';
import ChatPanel from '../components/ChatPanel';
import FileTransfer from '../components/FileTransfer';
import Toolbar from '../components/Toolbar';

export default function Host() {
  const navigate = useNavigate();
  const [peerId, setPeerId] = useState(null);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [inputAgentStatus, setInputAgentStatus] = useState('disconnected');
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const peerRef = useRef(null);
  const dataConnRef = useRef(null);
  const cleanupRef = useRef([]);
  const screensRef = useRef([]);
  const [screens, setScreens] = useState([]);
  const [activeScreen, setActiveScreen] = useState(0);
  const mediaConnRef = useRef(null);

  const addChat = useCallback((msg) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Step 1: Capture screen
        setStatus('pick-screen');
        let stream;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: true,
            preferCurrentTab: false,
          });
        } catch {
          if (!cancelled) navigate('/');
          return;
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        const settings = stream.getVideoTracks()[0].getSettings();
        screensRef.current = [{
          stream,
          label: stream.getVideoTracks()[0].label || 'Screen 1',
          width: settings.width,
          height: settings.height,
        }];
        setScreens(screensRef.current.map((s, i) => ({ label: s.label, index: i })));

        stream.getVideoTracks()[0].onended = () => handleDisconnect();

        // Step 2: Create PeerJS peer
        setStatus('connecting');
        const { peer, peerId: id } = await createPeer();
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); peer.destroy(); return; }
        peerRef.current = peer;
        setPeerId(id);
        setStatus('waiting');

        // File receiver
        const fileHandler = createFileReceiver(
          (file) => setReceivedFiles((prev) => [...prev, file]),
          null
        );

        // Clipboard sync
        let clipSync = null;

        // Handle incoming data connection from viewer
        peer.on('connection', (dataConn) => {
          dataConnRef.current = dataConn;
          dataConn.on('open', () => {
            clipSync = setupClipboardSync(dataConn);
            cleanupRef.current.push(clipSync.cleanup);
          });

          dataConn.on('data', (msg) => {
            if (msg.ch === 'ctrl') {
              forwardControlToAgent(msg);
            } else if (msg.ch === 'chat') {
              addChat({ ...msg, fromRemote: true });
            } else if (msg.ch === 'file') {
              fileHandler(msg);
            } else if (msg.ch === 'clip') {
              clipSync?.handleMessage(msg);
            }
          });

          dataConn.on('close', () => {
            setStatus('waiting');
          });
        });

        // Handle incoming call from viewer
        peer.on('call', (call) => {
          mediaConnRef.current = call;
          call.answer(stream);
          setStatus('connected');

          call.on('close', () => setStatus('waiting'));
        });

        peer.on('disconnected', () => {
          // Try to reconnect to PeerJS cloud
          if (!peer.destroyed) peer.reconnect();
        });

        // Connect input agent
        try {
          await connectInputAgent(9876, {
            width: settings.width || screen.width,
            height: settings.height || screen.height,
          });
          setInputAgentStatus('connected');
        } catch {
          setInputAgentStatus('not-running');
        }

      } catch (err) {
        if (!cancelled) {
          console.error('Host init error:', err);
          setError(err.message);
          setStatus('error');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanupRef.current.forEach(fn => fn());
      screensRef.current.forEach(s => s.stream.getTracks().forEach(t => t.stop()));
      destroyPeer(peerRef.current);
    };
  }, [addChat, navigate]);

  const handleDisconnect = () => {
    cleanupRef.current.forEach(fn => fn());
    screensRef.current.forEach(s => s.stream.getTracks().forEach(t => t.stop()));
    destroyPeer(peerRef.current);
    navigate('/');
  };

  const handleAddScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
        preferCurrentTab: false,
      });
      const settings = stream.getVideoTracks()[0].getSettings();
      const newScreen = { stream, label: stream.getVideoTracks()[0].label || `Screen ${screensRef.current.length + 1}`, width: settings.width, height: settings.height };
      stream.getVideoTracks()[0].onended = () => {
        const idx = screensRef.current.indexOf(newScreen);
        if (idx !== -1) {
          screensRef.current.splice(idx, 1);
          setScreens(screensRef.current.map((s, i) => ({ label: s.label, index: i })));
          if (activeScreen >= screensRef.current.length) handleSwitchScreen(0);
        }
      };
      screensRef.current.push(newScreen);
      setScreens(screensRef.current.map((s, i) => ({ label: s.label, index: i })));
    } catch {}
  };

  const handleSwitchScreen = async (index) => {
    const target = screensRef.current[index];
    if (!target || !mediaConnRef.current) return;
    const sender = mediaConnRef.current.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(target.stream.getVideoTracks()[0]);
    }
    sendScreenConfig({ width: target.width, height: target.height });
    setActiveScreen(index);
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

  const statusText = {
    'pick-screen': 'Choose a screen to share...',
    initializing: 'Starting...',
    connecting: 'Connecting to PeerJS...',
    waiting: 'Waiting for viewer to connect...',
    connected: 'Viewer connected',
    disconnected: 'Viewer disconnected',
    error: 'Error starting session',
  };

  const statusColor = {
    'pick-screen': 'text-blue-400',
    initializing: 'text-zinc-400',
    connecting: 'text-blue-400',
    waiting: 'text-yellow-400',
    connected: 'text-green-400',
    disconnected: 'text-red-400',
    error: 'text-red-400',
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <Toolbar
        onDisconnect={handleDisconnect}
        onToggleChat={() => setShowChat(!showChat)}
        showChat={showChat}
        isHost
        screens={screens}
        activeScreen={activeScreen}
        onSwitchScreen={handleSwitchScreen}
        onAddScreen={handleAddScreen}
      />

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1b23] rounded-full">
            <span className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-green-400' :
              status === 'waiting' ? 'bg-yellow-400 animate-pulse' :
              status === 'error' ? 'bg-red-400' :
              'bg-blue-400 animate-pulse'
            }`} />
            <span className={`text-sm ${statusColor[status]}`}>{statusText[status]}</span>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">{error}</div>
          )}

          {peerId && <ConnectionInfo peerId={peerId} />}

          {(status === 'waiting' || status === 'connected') && (
            <div className="text-xs text-zinc-500">
              Input Agent: {inputAgentStatus === 'connected' ? (
                <span className="text-green-400">Connected</span>
              ) : (
                <span className="text-zinc-500">Not running — remote control disabled. Run: <code className="bg-zinc-800 px-1 rounded">node server/input-agent.js</code></span>
              )}
            </div>
          )}

          {(status === 'waiting' || status === 'connected') && (
            <FileTransfer onSendFile={handleSendFile} receivedFiles={receivedFiles} />
          )}
        </div>
      </div>

      {showChat && (
        <ChatPanel messages={chatMessages} onSend={handleSendChat} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}
