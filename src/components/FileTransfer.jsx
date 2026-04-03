import { useRef, useState } from 'react';

export default function FileTransfer({ onSendFile, receivedFiles, compact }) {
  const inputRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    setSending(true);
    try {
      await onSendFile(file);
    } catch (err) {
      console.error('File send error:', err);
    }
    setSending(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const downloadFile = (file) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {receivedFiles.map((file, i) => (
          <button
            key={i}
            onClick={() => downloadFile(file)}
            className="flex items-center gap-2 px-3 py-2 bg-[#1a1b23] border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {file.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {sending ? (
          <p className="text-blue-400 text-sm">Sending file...</p>
        ) : (
          <p className="text-zinc-500 text-sm">Drop a file here or click to send</p>
        )}
      </div>

      {receivedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Received files:</p>
          {receivedFiles.map((file, i) => (
            <button
              key={i}
              onClick={() => downloadFile(file)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-[#1a1b23] border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
