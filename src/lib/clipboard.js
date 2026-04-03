export function setupClipboardSync(dataConn) {
  let lastText = '';

  const sendClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text !== lastText && dataConn.open) {
        lastText = text;
        dataConn.send({ ch: 'clip', text });
      }
    } catch {}
  };

  const interval = setInterval(sendClipboard, 2000);

  return {
    cleanup: () => clearInterval(interval),
    handleMessage: async (msg) => {
      if (msg.ch === 'clip' && msg.text) {
        lastText = msg.text;
        try {
          await navigator.clipboard.writeText(msg.text);
        } catch {}
      }
    },
  };
}
