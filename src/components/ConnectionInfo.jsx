import { useState } from 'react';

export default function ConnectionInfo({ peerId }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#1a1b23] border border-zinc-700 rounded-xl p-6 space-y-4">
      <p className="text-zinc-400 text-sm">Share this ID with the viewer:</p>
      <p className="text-3xl font-mono font-bold text-white tracking-widest text-center">{peerId}</p>
      <button
        onClick={handleCopy}
        className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer"
      >
        {copied ? 'Copied!' : 'Copy to clipboard'}
      </button>
    </div>
  );
}
