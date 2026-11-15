const React = require('react');
const { useEffect, useMemo, useRef, useState } = React;
const { ipcRenderer } = require('./ipc.js');
const HIID_RESONANCE = require('../assets/hiidenkirnukivi_resonance_peaks.json');
const uiTheme = require('./uiTheme.js');
const drumPads = require('./drumPads.js');

const scPearlTextStyle = {
  fontFamily: uiTheme.typography.familyDisplay,
  fontWeight: uiTheme.typography.weightDisplay,
  letterSpacing: '0.02em',
  backgroundImage: uiTheme.typography.pearlGradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  textShadow: uiTheme.typography.pearlShadow,
};

const STRINGS = [
  { name: 'e', size: 1.5, baseFreq: 329.627556913 },
  { name: 'B', size: 2.0, baseFreq: 246.941650628 },
  { name: 'G', size: 2.5, baseFreq: 195.997717991 },
  { name: 'D', size: 3.5, baseFreq: 146.832383959 },
  { name: 'A', size: 4.0, baseFreq: 110.0 },
  { name: 'E', size: 4.5, baseFreq: 82.406889228 },
];

const MAX_PLAYABLE_FRET = 7;
const LEFT_MARGIN_SEMITONES = 0.25;
const RIGHT_MARGIN_SEMITONES = 0.1;
const FRET_NUMBERS = Array.from({ length: MAX_PLAYABLE_FRET + 1 }, (_unused, idx) => idx);
const INLAY_FRETS = [3, 5, 7];
const MIN_PITCH_OFFSET = -LEFT_MARGIN_SEMITONES;
const MAX_PITCH_OFFSET = MAX_PLAYABLE_FRET + RIGHT_MARGIN_SEMITONES;
const PITCH_OFFSET_RANGE = MAX_PITCH_OFFSET - MIN_PITCH_OFFSET;
const HIID_SCENE_NAME = 'Hiidenkirnukivi';

function hasInlay(fret) {
  return INLAY_FRETS.includes(fret);
}

function pointerPressureFromEvent(e) {
  const raw = Number(e?.pressure);
  if (e?.pointerType === 'mouse') {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return Math.max(0.2, Math.min(1, raw * 2));
  }
  if (!Number.isFinite(raw) || raw <= 0) return 0.7;
  return Math.max(0.05, Math.min(1, raw));
}

function getIpcRenderer() {
  if (!ipcRenderer
    || typeof ipcRenderer.send !== 'function'
    || typeof ipcRenderer.on !== 'function'
    || typeof ipcRenderer.removeListener !== 'function') {
    throw new Error('[ipc] ipcRenderer is unavailable in instrument renderer');
  }
  return ipcRenderer;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pitchOffsetFromXPercent(xPercent) {
  const t = clampUnit(Number(xPercent) / 100);
  return MIN_PITCH_OFFSET + (t * PITCH_OFFSET_RANGE);
}

function xPercentFromPitchOffset(pitchOffset) {
  const n = Number(pitchOffset);
  if (!Number.isFinite(n)) return 0;
  const t = (n - MIN_PITCH_OFFSET) / PITCH_OFFSET_RANGE;
  return clampPercent(clampUnit(t) * 100);
}

function frequencyFromPitchOffset(baseFreq, pitchOffset) {
  const base = Number(baseFreq);
  if (!Number.isFinite(base) || base <= 0) return 220;
  return base * Math.pow(2, Number(pitchOffset) / 12);
}

function pitchOffsetFromFrequency(baseFreq, freqHz) {
  const base = Number(baseFreq);
  const freq = Number(freqHz);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (!Number.isFinite(freq) || freq <= 0) return null;
  return 12 * Math.log2(freq / base);
}

function fretXPercent(fretNumber) {
  return xPercentFromPitchOffset(Number(fretNumber));
}

function inlayXPercent(fretNumber) {
  return xPercentFromPitchOffset(Number(fretNumber) - 0.5);
}

function stringCenterRatio(index) {
  return (index + 0.5) / STRINGS.length;
}

function pointerStateFromEvent(e, fretboardRef) {
  const rect = fretboardRef.current?.getBoundingClientRect?.();
  const width = Math.max(1, Number(rect?.width) || Number(window?.innerWidth) || 1);
  const height = Math.max(1, Number(rect?.height) || Number(window?.innerHeight) || 1);
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const rawX = Number(e?.clientX) - left;
  const rawY = Number(e?.clientY) - top;
  const inBounds = Number.isFinite(rawX)
    && Number.isFinite(rawY)
    && rawX >= 0
    && rawX <= width
    && rawY >= 0
    && rawY < height;
  const clampedX = Math.max(0, Math.min(width, rawX));
  const clampedY = Math.max(0, Math.min(height - Number.EPSILON, rawY));
  const xPercent = clampPercent((clampedX / width) * 100);
  const stringGap = height / STRINGS.length;
  const yInStringSpace = (clampedY / stringGap) - 0.5;
  const stringIndex = Math.max(0, Math.min(STRINGS.length - 1, Math.round(yInStringSpace)));
  const freqHz = frequencyFromPosition(stringIndex, xPercent);
  return {
    inBounds,
    xPercent,
    stringIndex,
    freqHz,
  };
}

function frequencyFromPosition(stringIndex, xPercent) {
  const baseFreq = Number(STRINGS[stringIndex]?.baseFreq) || 220;
  const pitchOffset = pitchOffsetFromXPercent(xPercent);
  return frequencyFromPitchOffset(baseFreq, pitchOffset);
}

function buildResonanceHints(peaks) {
  if (!Array.isArray(peaks)) return [];
  const hints = [];
  peaks.forEach((peak, peakIdx) => {
    const freqHz = Number(peak?.freqHz);
    if (!Number.isFinite(freqHz) || freqHz <= 0) return;
    STRINGS.forEach((stringSpec, stringIndex) => {
      const pitchOffset = pitchOffsetFromFrequency(stringSpec.baseFreq, freqHz);
      if (!Number.isFinite(pitchOffset)) return;
      if (pitchOffset < MIN_PITCH_OFFSET || pitchOffset > MAX_PITCH_OFFSET) return;
      const xPercent = xPercentFromPitchOffset(pitchOffset);
      hints.push({
        key: `res-${peakIdx}-${stringSpec.name}`,
        stringIndex,
        xPercent,
      });
    });
  });
  return hints;
}

module.exports = function InstrumentApp() {
  const activePointersRef = useRef(new Set());
  const pointerMetaRef = useRef(new Map());
  const padFlashTimersRef = useRef(new Map());
  const fretboardRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(true);
  const [sceneInputEnabled, setSceneInputEnabled] = useState(false);
  const [activeScene, setActiveScene] = useState('');
  const [touchVisuals, setTouchVisuals] = useState({});
  const [activePad, setActivePad] = useState(null);
  const resonanceHints = useMemo(() => buildResonanceHints(HIID_RESONANCE?.peaks || []), []);
  const showHiidHints = String(activeScene).trim().toLowerCase() === HIID_SCENE_NAME.toLowerCase();
  const nutXPercent = fretXPercent(0);

  const inputEnabled = connected && sceneInputEnabled;

  const sendTouch = (pointerId, active, freqHz = 220, pressure = 1) => {
    const ipc = getIpcRenderer();
    ipc.send('acoviz:instrument-touch', { id: pointerId, active, freqHz, pressure });
  };

  const sendStopAll = () => {
    const ipc = getIpcRenderer();
    ipc.send('acoviz:instrument-stop-all');
  };

  const sendNextScene = () => {
    const ipc = getIpcRenderer();
    ipc.send('acoviz:instrument-next-scene');
  };

  const sendDrumHit = (midiNote = 36, velocity = 1) => {
    const ipc = getIpcRenderer();
    ipc.send('acoviz:instrument-drum-hit', { midiNote, velocity });
  };

  const clearPadFlashTimer = (key) => {
    const timer = padFlashTimersRef.current.get(key);
    if (!timer) return;
    clearTimeout(timer);
    padFlashTimersRef.current.delete(key);
  };

  const flashPad = (key, durationMs = 90) => {
    clearPadFlashTimer(key);
    setActivePad(key);
    const timer = setTimeout(() => {
      setActivePad((prev) => (prev === key ? null : prev));
      padFlashTimersRef.current.delete(key);
    }, durationMs);
    padFlashTimersRef.current.set(key, timer);
  };

  const releaseAllTouches = () => {
    try { sendStopAll(); } catch {}
    for (const pointerId of Array.from(activePointersRef.current)) {
      try { sendTouch(pointerId, 0, 220, 0); } catch {}
    }
    activePointersRef.current.clear();
    pointerMetaRef.current.clear();
    setTouchVisuals({});
  };

  const upsertTouchVisual = (pointerId, stringIndex, xPercent) => {
    setTouchVisuals((prev) => ({
      ...prev,
      [pointerId]: {
        pointerId,
        stringIndex,
        xPercent,
        phase: Math.abs(Number(pointerId) || 0) % 10,
      },
    }));
  };

  const removeTouchVisual = (pointerId) => {
    setTouchVisuals((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, pointerId)) return prev;
      const next = { ...prev };
      delete next[pointerId];
      return next;
    });
  };

  useEffect(() => {
    let ipc;
    try {
      ipc = getIpcRenderer();
      setConnected(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setTimeout(() => { throw error; }, 0);
      return undefined;
    }

    const onSceneState = (_event, payload) => {
      setSceneLoading(Boolean(payload?.loading));
      setSceneInputEnabled(Boolean(payload?.inputEnabled));
      const active = String(payload?.activeScene || payload?.targetScene || '');
      setActiveScene(active);
    };

    ipc.on('acoviz:scene-state', onSceneState);
    ipc.send('acoviz:instrument-ready');

    window.addEventListener('beforeunload', releaseAllTouches);
    window.addEventListener('blur', releaseAllTouches);

    return () => {
      ipc.removeListener('acoviz:scene-state', onSceneState);
      window.removeEventListener('beforeunload', releaseAllTouches);
      window.removeEventListener('blur', releaseAllTouches);
      for (const key of Array.from(padFlashTimersRef.current.keys())) {
        clearPadFlashTimer(key);
      }
      releaseAllTouches();
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    if (sceneInputEnabled) return;
    releaseAllTouches();
  }, [connected, sceneInputEnabled]);

  const handleFretboardPointerDown = (e) => {
    if (!inputEnabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const pointerId = Number(e.pointerId);
    const state = pointerStateFromEvent(e, fretboardRef);
    if (!state.inBounds) return;
    const { xPercent, stringIndex, freqHz } = state;
    const pressure = pointerPressureFromEvent(e);

    sendTouch(pointerId, 1, freqHz, pressure);
    activePointersRef.current.add(pointerId);
    pointerMetaRef.current.set(pointerId, { stringIndex, xPercent });
    upsertTouchVisual(pointerId, stringIndex, xPercent);

    try { e.preventDefault(); } catch {}
    try { fretboardRef.current?.setPointerCapture?.(pointerId); } catch {}
  };

  const handleFretboardPointerMove = (e) => {
    if (!inputEnabled) return;

    const pointerId = Number(e.pointerId);
    if (!activePointersRef.current.has(pointerId)) return;
    const state = pointerStateFromEvent(e, fretboardRef);
    const { inBounds, xPercent, stringIndex, freqHz } = state;
    if (!inBounds) {
      sendTouch(pointerId, 0, freqHz, 0);
      activePointersRef.current.delete(pointerId);
      pointerMetaRef.current.delete(pointerId);
      removeTouchVisual(pointerId);
      try { e.currentTarget?.releasePointerCapture?.(pointerId); } catch {}
      try { e.preventDefault(); } catch {}
      return;
    }
    const pressure = pointerPressureFromEvent(e);

    sendTouch(pointerId, 1, freqHz, pressure);
    pointerMetaRef.current.set(pointerId, { stringIndex, xPercent });
    upsertTouchVisual(pointerId, stringIndex, xPercent);

    try { e.preventDefault(); } catch {}
  };

  const handlePointerEnd = (e) => {
    const pointerId = Number(e.pointerId);
    if (!activePointersRef.current.has(pointerId)) return;

    const meta = pointerMetaRef.current.get(pointerId);
    const stringIndex = Number(meta?.stringIndex);
    const safeStringIndex = Number.isFinite(stringIndex)
      ? Math.max(0, Math.min(STRINGS.length - 1, stringIndex))
      : 0;

    const state = pointerStateFromEvent(e, fretboardRef);
    const freqHz = Number.isFinite(state.freqHz)
      ? state.freqHz
      : frequencyFromPosition(safeStringIndex, Number(meta?.xPercent || 0));

    sendTouch(pointerId, 0, freqHz, 0);

    activePointersRef.current.delete(pointerId);
    pointerMetaRef.current.delete(pointerId);
    removeTouchVisual(pointerId);

    try { e.preventDefault(); } catch {}
    try { fretboardRef.current?.releasePointerCapture?.(pointerId); } catch {}
  };

  const handleDrumPadPointerDown = (e, padIndex, midiNote) => {
    if (!inputEnabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    flashPad(`drum-${padIndex}`, 90);
    sendDrumHit(midiNote, pointerPressureFromEvent(e));
    try { e.preventDefault(); } catch {}
  };

  const handleSceneButtonPointerDown = (e) => {
    if (!inputEnabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    flashPad('scene', 90);
    sendNextScene();
    try { e.preventDefault(); } catch {}
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden p-2 select-none"
      onPointerUpCapture={handlePointerEnd}
      onPointerCancelCapture={handlePointerEnd}
      style={{
        background: uiTheme.colors.surfaceBg,
        color: uiTheme.colors.textPrimary,
        fontFamily: uiTheme.typography.familyBody,
        fontWeight: uiTheme.typography.weightBody,
        textShadow: uiTheme.typography.bodyInsetShadow,
      }}
    >
      <style>{`
        @keyframes stringVibrate {
          0% { transform: translateY(0) scaleY(1.05); }
          25% { transform: translateY(-2px) scaleY(1.05); }
          75% { transform: translateY(2px) scaleY(1.05); }
          100% { transform: translateY(0) scaleY(1.05); }
        }
        .vibrating-segment {
          animation: stringVibrate 0.1s ease-in-out infinite;
          filter: blur(0.1px);
        }
        @keyframes resonanceHintsPulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1.0; }
        }
        .resonance-hints-layer {
          animation: resonanceHintsPulse ${uiTheme.timing.hintsPulseSec}s ease-in-out infinite;
        }
        .resonance-hint {
          border-radius: 9999px;
          background: ${uiTheme.gradients.resonanceHint};
          filter: blur(0.9px);
          mix-blend-mode: screen;
        }
      `}</style>

      <div className="mx-auto grid h-full w-full max-w-[1240px] grid-rows-[minmax(0,1fr)_minmax(0,40vh)] gap-4">
        <div
          ref={fretboardRef}
          onPointerDown={handleFretboardPointerDown}
          onPointerMove={handleFretboardPointerMove}
          className="relative min-h-0 w-full overflow-hidden rounded-lg"
          style={{
            pointerEvents: inputEnabled ? 'auto' : 'none',
            opacity: inputEnabled ? 1 : 0.5,
            touchAction: 'none',
            border: `1px solid ${uiTheme.instrument.panelBorder}`,
            boxShadow: uiTheme.colors.panelShadow,
          }}
        >
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: uiTheme.gradients.fretboard,
            }}
          />

          <div className="relative z-10 h-full w-full pointer-events-none">
            {FRET_NUMBERS.map((fretNumber) => {
              const isNut = fretNumber === 0;
              return (
                <div
                  key={`fret-${fretNumber}`}
                  className="absolute top-0 bottom-0 z-30"
                  style={{
                    left: `${fretXPercent(fretNumber)}%`,
                    width: isNut ? '12px' : '3px',
                    transform: 'translateX(-50%)',
                    opacity: isNut ? 1 : 0.95,
                    background: isNut
                      ? uiTheme.colors.nutColor
                      : 'linear-gradient(to bottom, #b0b0b0 0%, #f5f5f5 15%, #ffffff 25%, #d8d8d8 45%, #f0f0f0 55%, #ffffff 75%, #f5f5f5 85%, #a0a0a0 100%)',
                    boxShadow: isNut
                      ? 'inset -2px 0 4px rgba(0,0,0,0.4), 2px 0 10px rgba(0,0,0,0.6)'
                      : 'inset 0.5px 0.5px 1px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.3)',
                  }}
                />
              );
            })}
            {INLAY_FRETS.filter(hasInlay).map((fretNumber) => (
              <div
                key={`inlay-${fretNumber}`}
                className="absolute z-20 h-8 w-8 rounded-full opacity-80 shadow-inner"
                style={{
                  left: `${inlayXPercent(fretNumber)}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle at 35% 35%, #2a1e16 0%, #16100d 48%, #080606 100%)',
                  boxShadow: 'inset 0 0 4px rgba(255, 182, 124, 0.06), 0 0 0 1px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.5)',
                }}
              />
            ))}
          </div>

          {showHiidHints && resonanceHints.length > 0 && (
            <div className="resonance-hints-layer pointer-events-none absolute inset-0 z-20">
              {resonanceHints.map((hint) => (
                <div
                  key={hint.key}
                  className="resonance-hint absolute"
                  style={{
                    left: `${hint.xPercent}%`,
                    top: `${(stringCenterRatio(hint.stringIndex) * 100).toFixed(6)}%`,
                    width: '64px',
                    height: '64px',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 z-40">
            {STRINGS.map((string, idx) => {
              const touchesOnString = Object.values(touchVisuals).filter((touch) => touch.stringIndex === idx);

              return (
                <div
                  key={`string-${string.name}-${idx}`}
                  className="absolute left-0 w-full pointer-events-none"
                  style={{
                    top: `${(stringCenterRatio(idx) * 100).toFixed(6)}%`,
                    transform: 'translateY(-50%)',
                    height: `${string.size + 24}px`,
                  }}
                >
                  <div className="relative flex h-full w-full items-center">
                    <div
                      style={{
                        marginLeft: `${nutXPercent}%`,
                        width: `${100 - nutXPercent}%`,
                        height: `${string.size}px`,
                        backgroundColor: uiTheme.colors.string,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.6)',
                        backgroundImage: `linear-gradient(to bottom, ${uiTheme.colors.stringTopLight} 0%, transparent 30%, ${uiTheme.colors.stringBottomShade} 100%)`,
                      }}
                    />
                    {touchesOnString.map((touch) => (
                      <div
                        key={`touch-${touch.pointerId}`}
                        className="vibrating-segment absolute"
                        style={{
                          left: `${touch.xPercent}%`,
                          width: `${Math.max(0, 100 - touch.xPercent)}%`,
                          height: `${string.size}px`,
                          backgroundColor: uiTheme.colors.string,
                          boxShadow: '0 0 4px rgba(255,255,255,0.2)',
                          backgroundImage: `linear-gradient(to bottom, ${uiTheme.colors.stringTopLight} 0%, transparent 30%, ${uiTheme.colors.stringBottomShade} 100%)`,
                          transformOrigin: 'left center',
                          animationDelay: `${-(touch.phase * 0.03).toFixed(2)}s`,
                        }}
                      />
                    ))}
                    {touchesOnString.map((touch) => (
                      <div
                        key={`touch-dot-${touch.pointerId}`}
                        className="absolute rounded-full bg-white/80"
                        style={{
                          left: `${touch.xPercent}%`,
                          width: `${Math.max(8, string.size + 6)}px`,
                          height: `${Math.max(8, string.size + 6)}px`,
                          transform: 'translate(-50%, 0)',
                          boxShadow: '0 0 8px rgba(255, 255, 255, 0.5)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="flex h-full w-full max-w-[1240px] items-stretch gap-4 rounded-2xl p-3"
          style={{
            pointerEvents: inputEnabled ? 'auto' : 'none',
            opacity: inputEnabled ? 1 : 0.5,
            border: `1px solid ${uiTheme.instrument.panelBorder}`,
            background: uiTheme.instrument.panelBg,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
          }}
        >
          <div className="mr-auto flex h-full items-stretch gap-4">
            {drumPads(activeScene).map((pad, idx) => (
              <button
                key={`pad-${idx}-${pad.label}`}
                onPointerDown={(e) => handleDrumPadPointerDown(e, idx, pad.midiNote)}
                className={`group relative flex aspect-square h-full w-auto items-center justify-center overflow-hidden rounded-xl transition-[transform,filter] duration-75 active:scale-[0.985] ${activePad === `drum-${idx}` ? 'drum-pad-hit' : ''}`}
                disabled={!inputEnabled}
              >
                <div
                  className="absolute inset-0 transition-all duration-75"
                  style={{
                    backgroundColor: activePad === `drum-${idx}` ? uiTheme.instrument.padBgActive : uiTheme.instrument.padBgIdle,
                    backgroundImage: uiTheme.gradients.buttonInner,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ border: `1px solid ${uiTheme.instrument.panelBorder}` }} />
                <span
                  className="relative z-10 text-[3rem] leading-none transition-all duration-75"
                  style={{
                    ...scPearlTextStyle,
                    opacity: activePad === `drum-${idx}` ? 1 : 0.92,
                  }}
                >
                  {pad.label}
                </span>
              </button>
            ))}
          </div>

          <div className="w-px self-stretch" style={{ background: uiTheme.instrument.panelBorder }} />

          <button
            onPointerDown={handleSceneButtonPointerDown}
            className={`group relative ml-auto flex aspect-square h-full w-auto items-center justify-center overflow-hidden rounded-xl transition-[transform,filter] duration-75 active:scale-[0.985] ${activePad === 'scene' ? 'drum-pad-hit' : ''}`}
            disabled={!inputEnabled}
          >
            <div
              className="absolute inset-0 transition-all duration-75"
              style={{
                backgroundColor: activePad === 'scene' ? uiTheme.instrument.sceneButtonBgActive : uiTheme.instrument.sceneButtonBgIdle,
                backgroundImage: uiTheme.gradients.buttonInnerStrong,
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ border: `1px solid ${uiTheme.instrument.panelBorder}` }} />
            <span
              className="relative z-10 text-center text-[3rem] leading-[1.02]"
              style={{
                ...scPearlTextStyle,
                opacity: activePad === 'scene' ? 1 : 0.92,
              }}
            >
              Change
              <br />
              Scene
            </span>
          </button>
        </div>
      </div>

      {!inputEnabled && (
        <div
          className="absolute inset-0 z-[200] flex items-center justify-center text-5xl"
          style={{ background: uiTheme.colors.loadingOverlay }}
        >
          <span style={scPearlTextStyle}>Loading…</span>
        </div>
      )}
    </div>
  );
};
