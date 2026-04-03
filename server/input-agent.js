// Input Agent — runs locally on the host machine to inject mouse/keyboard events.
// Usage: node server/input-agent.js
// Optimized: fire-and-forget input injection, no await blocking between events.

import { WebSocketServer } from 'ws';

const PORT = 9876;

async function main() {
  const { mouse, keyboard, Point, Button, Key, screen } = await import('@nut-tree-fork/nut-js');
  mouse.config.autoDelayMs = 0;
  keyboard.config.autoDelayMs = 0;

  const primaryWidth = await screen.width();
  const primaryHeight = await screen.height();
  console.log(`Primary screen: ${primaryWidth}x${primaryHeight}`);

  const buttonMap = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

  const keyMap = new Map([
    ['Enter', Key.Enter], ['Backspace', Key.Backspace], ['Tab', Key.Tab],
    ['Escape', Key.Escape], ['Delete', Key.Delete], ['Home', Key.Home],
    ['End', Key.End], ['PageUp', Key.PageUp], ['PageDown', Key.PageDown],
    ['ArrowUp', Key.Up], ['ArrowDown', Key.Down], ['ArrowLeft', Key.Left], ['ArrowRight', Key.Right],
    ['Control', Key.LeftControl], ['Shift', Key.LeftShift], ['Alt', Key.LeftAlt], ['Meta', Key.LeftSuper],
    [' ', Key.Space],
    ['F1', Key.F1], ['F2', Key.F2], ['F3', Key.F3], ['F4', Key.F4],
    ['F5', Key.F5], ['F6', Key.F6], ['F7', Key.F7], ['F8', Key.F8],
    ['F9', Key.F9], ['F10', Key.F10], ['F11', Key.F11], ['F12', Key.F12],
  ]);

  const modMap = { ctrl: Key.LeftControl, shift: Key.LeftShift, alt: Key.LeftAlt };

  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
  console.log(`Input agent listening on ws://127.0.0.1:${PORT}`);

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      ws.close();
      return;
    }
    console.log('Host page connected');

    let mapWidth = primaryWidth;
    let mapHeight = primaryHeight;
    let offsetX = 0;
    let offsetY = 0;

    // Process events fire-and-forget — don't await, don't block the next event
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'screen-config') {
          mapWidth = msg.width || primaryWidth;
          mapHeight = msg.height || primaryHeight;
          offsetX = msg.offsetX || 0;
          offsetY = msg.offsetY || 0;
          console.log(`Screen config: ${mapWidth}x${mapHeight} offset(${offsetX},${offsetY})`);
          return;
        }

        const absX = (msg.x * mapWidth + offsetX) | 0; // Bitwise floor — faster than Math.round
        const absY = (msg.y * mapHeight + offsetY) | 0;
        const pt = new Point(absX, absY);

        switch (msg.type) {
          case 'mousemove':
            mouse.setPosition(pt);
            break;

          case 'mousedown':
            mouse.setPosition(pt).then(() => mouse.pressButton(buttonMap[msg.button] || Button.LEFT));
            break;

          case 'mouseup':
            mouse.setPosition(pt).then(() => mouse.releaseButton(buttonMap[msg.button] || Button.LEFT));
            break;

          case 'scroll':
            mouse.setPosition(pt).then(() => {
              if (msg.deltaY > 0) mouse.scrollDown(Math.min(Math.abs(msg.deltaY) / 100, 5) | 0 || 1);
              else if (msg.deltaY < 0) mouse.scrollUp(Math.min(Math.abs(msg.deltaY) / 100, 5) | 0 || 1);
            });
            break;

          case 'keydown': {
            const nutKey = keyMap.get(msg.key);
            if (nutKey) {
              const mods = msg.modifiers?.map(m => modMap[m]).filter(Boolean) || [];
              if (mods.length) {
                keyboard.pressKey(...mods, nutKey).then(() => keyboard.releaseKey(nutKey, ...mods));
              } else {
                keyboard.pressKey(nutKey).then(() => keyboard.releaseKey(nutKey));
              }
            } else if (msg.key.length === 1) {
              keyboard.type(msg.key);
            }
            break;
          }
        }
      } catch {}
    });

    ws.on('close', () => console.log('Host page disconnected'));
  });
}

main().catch(console.error);
