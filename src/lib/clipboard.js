export function setupClipboardSync(channel) {
  let lastText = '';

  const sendClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text !== lastText && channel.open) {
        lastText = text;
        channel.send({ type: 'clipboard', text });
      }
    } catch {}
  };

  const interval = setInterval(sendClipboard, 2000);

  return {
    cleanup: () => clearInterval(interval),
    handleMessage: async (msg) => {
      if (msg.type === 'clipboard' && msg.text) {
        lastText = msg.text;
        try { await navigator.clipboard.writeText(msg.text); } catch {}
      }
    },
  };
}
