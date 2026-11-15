const { useEffect, useRef } = require('react');

// Latest meter frame from the audio engine's meter (an EventTarget of 'frame' events).
module.exports.useJackMeter = function useJackMeter(source) {
  const latestRef = useRef({ seq: 0, rms: 0, peak: 0, db: -120, n: 0 });
  useEffect(() => {
    if (!source) return undefined;
    const onFrame = (e) => { latestRef.current = e.detail; };
    source.addEventListener('frame', onFrame);
    return () => source.removeEventListener('frame', onFrame);
  }, [source]);
  return latestRef;
};
