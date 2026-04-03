const CHUNK_SIZE = 64 * 1024;

export function sendFile(channel, file, onProgress) {
  return new Promise((resolve, reject) => {
    channel.send({ type: 'file-meta', name: file.name, size: file.size, mimeType: file.type });

    const reader = new FileReader();
    let offset = 0;

    const readSlice = () => {
      reader.readAsArrayBuffer(file.slice(offset, offset + CHUNK_SIZE));
    };

    reader.onload = (e) => {
      channel.send({ type: 'file-chunk', data: Array.from(new Uint8Array(e.target.result)) });
      offset += e.target.result.byteLength;
      if (onProgress) onProgress(offset / file.size);

      if (offset < file.size) readSlice();
      else { channel.send({ type: 'file-end' }); resolve(); }
    };

    reader.onerror = reject;
    readSlice();
  });
}

export function createFileReceiver(onFileReceived, onProgress) {
  let currentFile = null;
  let chunks = [];
  let received = 0;

  return (msg) => {
    if (msg.type === 'file-meta') {
      currentFile = msg;
      chunks = [];
      received = 0;
    } else if (msg.type === 'file-chunk' && currentFile) {
      const bytes = new Uint8Array(msg.data);
      chunks.push(bytes);
      received += bytes.byteLength;
      if (onProgress) onProgress(received / currentFile.size);
    } else if (msg.type === 'file-end' && currentFile) {
      const blob = new Blob(chunks, { type: currentFile.mimeType });
      onFileReceived({ name: currentFile.name, blob });
      currentFile = null;
      chunks = [];
      received = 0;
    }
  };
}
