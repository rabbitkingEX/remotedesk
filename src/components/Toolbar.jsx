export default function Toolbar({
  onDisconnect, onToggleChat, onFullscreen, onSwitchScreen, onAddScreen,
  showChat, isFullscreen, isHost, stats,
  screens, activeScreen,
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#1a1b23] border-b border-zinc-800 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-300">RemoteDesk</span>
          {isHost && <span className="text-xs px-2 py-0.5 bg-zinc-700 rounded text-zinc-400">Host</span>}
        </div>

        {/* Screen switcher tabs (host only) */}
        {screens && screens.length > 0 && (
          <div className="flex items-center gap-1 ml-3">
            {screens.map((s, i) => (
              <button
                key={i}
                onClick={() => onSwitchScreen(i)}
                className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  i === activeScreen
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
                title={s.label}
              >
                {i + 1}
              </button>
            ))}
            {onAddScreen && (
              <button
                onClick={onAddScreen}
                className="px-2 py-1 text-xs bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 rounded transition-colors cursor-pointer"
                title="Add another screen"
              >
                +
              </button>
            )}
          </div>
        )}

        {stats && (
          <div className="flex items-center gap-3 text-xs text-zinc-500 ml-4">
            <span>{stats.width}x{stats.height}</span>
            <span>{stats.fps} FPS</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Chat toggle */}
        <button
          onClick={onToggleChat}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${showChat ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
          title="Chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>

        {/* Fullscreen */}
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            title="Fullscreen"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isFullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              )}
            </svg>
          </button>
        )}

        {/* Disconnect */}
        <button
          onClick={onDisconnect}
          className="ml-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-sm rounded-lg transition-colors cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
