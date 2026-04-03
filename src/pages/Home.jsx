import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [peerId, setPeerId] = useState('');
  const [error, setError] = useState('');

  const handleConnect = (e) => {
    e.preventDefault();
    const id = peerId.trim();
    if (!id) {
      setError('Enter a Peer ID');
      return;
    }
    navigate(`/viewer?peer=${id}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md space-y-8 px-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">RemoteDesk</h1>
          <p className="text-zinc-400 mt-2">Peer-to-peer remote desktop — no server needed</p>
        </div>

        <button
          onClick={() => navigate('/host')}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-xl transition-colors cursor-pointer"
        >
          Share This Screen
        </button>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-zinc-700" />
          <span className="text-zinc-500 text-sm">or connect to a remote PC</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>

        <form onSubmit={handleConnect} className="space-y-4">
          <input
            type="text"
            placeholder="Enter Peer ID (e.g. rd-a1b2c3)"
            value={peerId}
            onChange={(e) => { setPeerId(e.target.value); setError(''); }}
            className="w-full px-4 py-3 bg-[#1a1b23] border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-lg tracking-wider text-center focus:border-blue-500 transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Connect
          </button>
        </form>

        <p className="text-center text-zinc-600 text-xs mt-8">
          End-to-end encrypted via WebRTC — no server sees your data
        </p>
      </div>
    </div>
  );
}
