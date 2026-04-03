import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, fetchIceServers, createRoom, createPeerConnection, setupHostSignaling, disconnect } from '../lib/peer';
import { forwardControlToAgent, connectInputAgent, sendScreenConfig } from '../lib/control';
import { setupClipboardSync } from '../lib/clipboard';
import { createFileReceiver } from '../lib/fileTransfer';
import ConnectionInfo from '../components/ConnectionInfo';
import ChatPanel from '../components/ChatPanel';
import FileTransfer from '../components/FileTransfer';
import Toolbar from '../components/Toolbar';

export default function Host() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(null);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [inputAgentStatus, setInputAgentStatus] = useState('disconnected');
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [screens, setScreens] = useState([]);
  const [activeScreen, setActiveScreen] = useState(0);
  const pcRef = useRef(null);
  const cleanupRef = useRef([]);
  const screensRef = useRef([]);
  const controlChRef = useRef(null);
  const chatChRef = useRef(null);
  const fileChRef = useRef(null);
  const clipChRef = useRef(null);

  const addChat = useCallback((msg) => setChatMessages((prev) => [...prev, msg]), []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Capture screen
        setStatus('pick-screen');
        let stream;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: true,
          });
        } catch { if (!cancelled) navigate('/'); return; }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        const settings = stream.getVideoTracks()[0].getSettings();
        screensRef.current = [{ stream, label: stream.getVideoTracks()[0].label || 'Screen 1', width: settings.width, height: settings.height }];
        setScreens(screensRef.current.map((s, i) => ({ label: s.label, index: i })));
        stream.getVideoTracks()[0].onended = () => handleDisconnect();

        // Connect to server
        setStatus('connecting');
        const socket = getSocket();
        await new Promise((resolve, reject) => {
          if (socket.connected) { resolve(); return; }
          const t = setTimeout(() => reject(new Error('Server timeout')), 10000);
          socket.on('connect', () => { clearTimeout(t); resolve(); });
          socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        // Create room
        const id = await createRoom();
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        setRoomId(id);
        setStatus('waiting');

        // Fetch ICE servers (includes your TURN)
        const iceServers = await fetchIceServers();

        // WebRTC
        const pc = createPeerConnection(iceServers, null, null, (state) => {
          if (state === 'connected') setStatus('connected');
          else if (state === 'disconnected' || state === 'failed') setStatus('disconnected');
        });
        pcRef.current = pc;

        // Add screen stream
        stream.getTracks().forEach(track => {
          const sender = pc.addTrack(track, stream);
          if (track.kind === 'video') {
            const params = sender.getParameters();
            if (params.encodings?.[0]) {
              params.encodings[0].maxBitrate = 6_000_000;
              params.encodings[0].maxFramerate = 30;
              params.degradationPreference = 'maintain-framerate';
              sender.setParameters(params).catch(() => {});
            }
          }
        });

        // Data channels
        const control = pc.createDataChannel('control', { ordered: false, maxRetransmits: 0 });
        const chat = pc.createDataChannel('chat', { ordered: true });
        const files = pc.createDataChannel('files', { ordered: true });
        const clip = pc.createDataChannel('clipboard', { ordered: true });
        controlChRef.current = control;
        chatChRef.current = chat;
        fileChRef.current = files;
        clipChRef.current = clip;

        // File receiver
        const fileHandler = createFileReceiver((file) => setReceivedFiles((prev) => [...prev, file]), null);
        files.onmessage = (e) => {
          try { fileHandler(JSON.parse(e.data)); } catch {}
        };

        // Chat
        chat.onmessage = (e) => {
          try { addChat({ ...JSON.parse(e.data), fromRemote: true }); } catch {}
        };

        // Control -> input agent
        control.onmessage = (e) => {
          forwardControlToAgent(JSON.parse(e.data));
        };

        // Clipboard
        let clipSync = null;
        clip.onopen = () => {
          clipSync = setupClipboardSync({ open: true, send: (msg) => clip.send(JSON.stringify(msg)) });
          cleanupRef.current.push(clipSync.cleanup);
        };
        clip.onmessage = (e) => {
          try { clipSync?.handleMessage(JSON.parse(e.data)); } catch {}
        };

        // Wait for viewer
        await setupHostSignaling(pc);
        if (cancelled) return;

        // Input agent
        try {
          await connectInputAgent(9876, { width: settings.width, height: settings.height });
          setInputAgentStatus('connected');
        } catch { setInputAgentStatus('not-running'); }

        socket.on('viewer-disconnected', () => setStatus('waiting'));

      } catch (err) {
        if (!cancelled) { setError(err.message); setStatus('error'); console.error('Host error:', err); }
      }
    };

    init();
    return () => { cancelled = true; cleanupRef.current.forEach(fn => fn()); screensRef.current.forEach(s => s.stream.getTracks().forEach(t => t.stop())); if (pcRef.current) pcRef.current.close(); disconnect(); };
  }, [addChat, navigate]);

  const handleDisconnect = () => {
    cleanupRef.current.forEach(fn => fn());
    screensRef.current.forEach(s => s.stream.getTracks().forEach(t => t.stop()));
    if (pcRef.current) pcRef.current.close();
    disconnect();
    navigate('/');
  };

  const handleAddScreen = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } }, audio: false });
      const settings = s.getVideoTracks()[0].getSettings();
      const ns = { stream: s, label: s.getVideoTracks()[0].label || `Screen ${screensRef.current.length + 1}`, width: settings.width, height: settings.height };
      s.getVideoTracks()[0].onended = () => { const i = screensRef.current.indexOf(ns); if (i !== -1) { screensRef.current.splice(i, 1); setScreens(screensRef.current.map((x, j) => ({ label: x.label, index: j }))); } };
      screensRef.current.push(ns);
      setScreens(screensRef.current.map((x, i) => ({ label: x.label, index: i })));
    } catch {}
  };

  const handleSwitchScreen = async (index) => {
    const target = screensRef.current[index];
    if (!target || !pcRef.current) return;
    const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(target.stream.getVideoTracks()[0]);
    sendScreenConfig({ width: target.width, height: target.height });
    setActiveScreen(index);
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

  const statusText = { 'pick-screen': 'Choose a screen...', connecting: 'Connecting...', waiting: 'Waiting for viewer...', connected: 'Viewer connected', disconnected: 'Disconnected', error: 'Error' };
  const statusColor = { 'pick-screen': 'text-blue-400', connecting: 'text-blue-400', waiting: 'text-yellow-400', connected: 'text-green-400', disconnected: 'text-red-400', error: 'text-red-400' };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <Toolbar onDisconnect={handleDisconnect} onToggleChat={() => setShowChat(!showChat)} showChat={showChat} isHost screens={screens} activeScreen={activeScreen} onSwitchScreen={handleSwitchScreen} onAddScreen={handleAddScreen} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1b23] rounded-full">
            <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400' : status === 'waiting' ? 'bg-yellow-400 animate-pulse' : status === 'error' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'}`} />
            <span className={`text-sm ${statusColor[status]}`}>{statusText[status]}</span>
          </div>
          {error && <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">{error}</div>}
          {roomId && <ConnectionInfo peerId={roomId} />}
          {(status === 'waiting' || status === 'connected') && (
            <div className="text-xs text-zinc-500">
              Input Agent: {inputAgentStatus === 'connected' ? <span className="text-green-400">Connected</span> : <span>Not running. Run: <code className="bg-zinc-800 px-1 rounded">node server/input-agent.js</code></span>}
            </div>
          )}
          {(status === 'waiting' || status === 'connected') && <FileTransfer onSendFile={handleSendFile} receivedFiles={receivedFiles} />}
        </div>
      </div>
      {showChat && <ChatPanel messages={chatMessages} onSend={handleSendChat} onClose={() => setShowChat(false)} />}
    </div>
  );
}
