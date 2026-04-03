const MOUSE_THROTTLE_MS = 8;

export function attachViewerControls(videoElement, controlChannel) {
  let lastMoveTime = 0;
  let rafId = null;
  let pendingMove = null;

  const getRelativeCoords = (e) => {
    const rect = videoElement.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const send = (msg) => {
    if (controlChannel.readyState === 'open') controlChannel.send(JSON.stringify(msg));
  };

  const flushMove = () => {
    rafId = null;
    if (pendingMove && controlChannel.readyState === 'open' && controlChannel.bufferedAmount < 1024) {
      controlChannel.send(JSON.stringify(pendingMove));
      pendingMove = null;
    }
  };

  const onMouseMove = (e) => {
    const now = performance.now();
    if (now - lastMoveTime < MOUSE_THROTTLE_MS) {
      pendingMove = { type: 'mousemove', ...getRelativeCoords(e) };
      if (!rafId) rafId = requestAnimationFrame(flushMove);
      return;
    }
    lastMoveTime = now;
    pendingMove = null;
    send({ type: 'mousemove', ...getRelativeCoords(e) });
  };

  const onMouseDown = (e) => send({ type: 'mousedown', button: e.button, ...getRelativeCoords(e) });
  const onMouseUp = (e) => send({ type: 'mouseup', button: e.button, ...getRelativeCoords(e) });
  const onWheel = (e) => { e.preventDefault(); send({ type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY, ...getRelativeCoords(e) }); };
  const onKeyDown = (e) => { e.preventDefault(); send({ type: 'keydown', key: e.key, code: e.code, modifiers: getModifiers(e) }); };
  const onKeyUp = (e) => { e.preventDefault(); send({ type: 'keyup', key: e.key, code: e.code, modifiers: getModifiers(e) }); };
  const onContextMenu = (e) => e.preventDefault();

  videoElement.addEventListener('mousemove', onMouseMove);
  videoElement.addEventListener('mousedown', onMouseDown);
  videoElement.addEventListener('mouseup', onMouseUp);
  videoElement.addEventListener('wheel', onWheel, { passive: false });
  videoElement.addEventListener('contextmenu', onContextMenu);
  videoElement.setAttribute('tabindex', '0');
  videoElement.addEventListener('keydown', onKeyDown);
  videoElement.addEventListener('keyup', onKeyUp);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    videoElement.removeEventListener('mousemove', onMouseMove);
    videoElement.removeEventListener('mousedown', onMouseDown);
    videoElement.removeEventListener('mouseup', onMouseUp);
    videoElement.removeEventListener('wheel', onWheel);
    videoElement.removeEventListener('contextmenu', onContextMenu);
    videoElement.removeEventListener('keydown', onKeyDown);
    videoElement.removeEventListener('keyup', onKeyUp);
  };
}

function getModifiers(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('meta');
  return mods;
}

let inputAgentWs = null;

export function connectInputAgent(port = 9876, screenConfig = null) {
  return new Promise((resolve, reject) => {
    inputAgentWs = new WebSocket(`ws://localhost:${port}`);
    inputAgentWs.onopen = () => {
      if (screenConfig) inputAgentWs.send(JSON.stringify({ type: 'screen-config', ...screenConfig }));
      resolve();
    };
    inputAgentWs.onerror = () => reject(new Error('Input agent not running'));
    inputAgentWs.onclose = () => { inputAgentWs = null; };
  });
}

export function sendScreenConfig(config) {
  if (inputAgentWs?.readyState === WebSocket.OPEN) inputAgentWs.send(JSON.stringify({ type: 'screen-config', ...config }));
}

export function forwardControlToAgent(msg) {
  if (inputAgentWs?.readyState === WebSocket.OPEN) inputAgentWs.send(JSON.stringify(msg));
}
