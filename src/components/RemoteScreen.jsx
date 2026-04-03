import { useRef, useEffect } from 'react';
import { attachViewerControls } from '../lib/control';

export default function RemoteScreen({ stream, getDataConn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;

    if ('requestVideoFrameCallback' in video) {
      let active = true;
      const onFrame = () => { if (active) video.requestVideoFrameCallback(onFrame); };
      video.requestVideoFrameCallback(onFrame);
      return () => { active = false; video.srcObject = null; };
    }

    return () => { video.srcObject = null; };
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let detach = null;
    let stopped = false;

    const tryAttach = () => {
      if (stopped || detach) return;
      const dc = getDataConn();
      if (dc?.open) {
        detach = attachViewerControls(video, dc);
      }
    };

    const interval = setInterval(tryAttach, 500);
    tryAttach();

    return () => {
      stopped = true;
      clearInterval(interval);
      if (detach) detach();
    };
  }, [getDataConn]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="remote-screen max-w-full max-h-full object-contain"
      style={{ background: '#000' }}
    />
  );
}
