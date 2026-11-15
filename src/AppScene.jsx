const React = require('react');
const { useState, useEffect, useRef, useCallback } = React;
const { SceneAudioEngine } = require('./audio.js');
const { ipcRenderer } = require('./ipc.js');
const { useViewport, screenScale, InstrumentOpenContext } = require('../scenes/common.js');
const drumPads = require('./drumPads.js');
const uiTheme = require('./uiTheme.js');
const SCENES = require('../scenes.js');

const SCENE_KEYS = Object.keys(SCENES);
const MAX_TOUCH_VOICES = 8;
// The instrument's screen in the exhibition. It takes at most the lower half of the page.
const INSTRUMENT_SIZE = { width: 1280, height: 800 };
const TOGGLE_SIZE = 48;

function pointerPressureFromEvent(e) {
  const raw = Number(e?.pressure);
  if (e?.pointerType === 'mouse') {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return Math.max(0.2, Math.min(1, raw * 2));
  }
  if (!Number.isFinite(raw) || raw <= 0) return 0.7;
  return Math.max(0.05, Math.min(1, raw));
}

function initialScene() {
  const name = String(new URLSearchParams(window.location.search).get('scene')).toLowerCase();
  return SCENE_KEYS.find((key) => key.toLowerCase() === name) || SCENE_KEYS[0];
}

const toggleStyle = {
  width: TOGGLE_SIZE,
  height: TOGGLE_SIZE,
  padding: 0,
  fontSize: TOGGLE_SIZE / 2,
  color: uiTheme.colors.textPrimary,
  background: uiTheme.gradients.scenePanel,
  border: `1px solid ${uiTheme.colors.panelBorderWarm}`,
  borderRadius: TOGGLE_SIZE / 4,
  cursor: 'pointer',
};

function Toggle({ icon, label, onClick }) {
  return (
    <button type="button" title={label} aria-label={label} style={toggleStyle} onClick={onClick}>
      <i className={`fa-solid ${icon}`} aria-hidden />
    </button>
  );
}

module.exports = function SceneApp() {
  const [sceneName, setSceneName] = useState(initialScene);
  const [engine, setEngine] = useState(null);
  const [visualReady, setVisualReady] = useState(false);
  const [showInstrument, setShowInstrument] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const viewport = useViewport();
  const loading = !engine || !visualReady;
  const stateRef = useRef();
  stateRef.current = { sceneName, engine, loading };
  const touchPointersRef = useRef(new Map());

  useEffect(() => {
    SceneAudioEngine.create().then(setEngine);
  }, []);

  useEffect(() => {
    engine?.activateScene(sceneName);
  }, [engine, sceneName]);

  const nextScene = () => {
    if (stateRef.current.loading) return;
    setVisualReady(false);
    setSceneName((name) => SCENE_KEYS[(SCENE_KEYS.indexOf(name) + 1) % SCENE_KEYS.length]);
  };

  const hitDrum = (velocity) => {
    const current = stateRef.current;
    if (current.loading) return;
    current.engine.triggerDrum(drumPads(current.sceneName)[0].midiNote, velocity);
  };

  const allocTouchSlot = () => {
    const inUse = new Set(touchPointersRef.current.values());
    for (let slot = 1; slot <= MAX_TOUCH_VOICES; slot += 1) {
      if (!inUse.has(slot)) return slot;
    }
    return null;
  };

  const beginTouch = (id, freqHz, pressure) => {
    if (stateRef.current.loading) return;
    const slot = allocTouchSlot();
    if (!slot) return;
    touchPointersRef.current.set(id, slot);
    stateRef.current.engine.setVirtualTouch({ slot, active: 1, freqHz, pressure });
  };

  const updateTouch = (id, freqHz, pressure) => {
    const slot = touchPointersRef.current.get(id);
    stateRef.current.engine.setVirtualTouch({ slot, active: 1, freqHz, pressure });
  };

  const endTouch = (id, freqHz) => {
    const slot = touchPointersRef.current.get(id);
    if (!slot) return;
    touchPointersRef.current.delete(id);
    stateRef.current.engine.setVirtualTouch({ slot, active: 0, freqHz, pressure: 0 });
  };

  const stopTouchInstrument = () => {
    for (const slot of touchPointersRef.current.values()) stateRef.current.engine.stopVirtualInstrument(slot);
    touchPointersRef.current.clear();
  };

  const sendSceneState = () => {
    const { sceneName: activeScene, loading: sceneLoading } = stateRef.current;
    ipcRenderer.send('acoviz:scene-state', { activeScene, loading: sceneLoading, inputEnabled: !sceneLoading });
  };

  useEffect(sendSceneState, [sceneName, loading]);

  useEffect(() => {
    const handlers = {
      'acoviz:instrument-ready': sendSceneState,
      'acoviz:instrument-touch': (_event, { id = 0, active = 0, freqHz = 220, pressure = 1 } = {}) => {
        if (!active) endTouch(id, freqHz);
        else if (touchPointersRef.current.has(id)) updateTouch(id, freqHz, pressure);
        else beginTouch(id, freqHz, pressure);
      },
      'acoviz:instrument-stop-all': stopTouchInstrument,
      'acoviz:instrument-next-scene': nextScene,
      'acoviz:instrument-drum-hit': (_event, { midiNote = 36, velocity = 1 } = {}) => {
        if (!stateRef.current.loading) stateRef.current.engine.triggerDrum(midiNote, velocity);
      },
    };
    for (const [channel, handler] of Object.entries(handlers)) ipcRenderer.on(channel, handler);
    return () => {
      for (const [channel, handler] of Object.entries(handlers)) ipcRenderer.removeListener(channel, handler);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyC') nextScene();
      // Space on a focused button presses the button.
      if (e.code === 'Space' && !e.target?.closest?.('button')) {
        e.preventDefault();
        hitDrum(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target?.closest?.('button')) return;
    hitDrum(pointerPressureFromEvent(e));
  };

  const toggleInstrument = () => {
    engine.start();
    if (showInstrument) stopTouchInstrument();
    setShowInstrument(!showInstrument);
  };

  const toggleMicrophone = () => {
    setMicOn(!micOn);
    engine.setMicrophone(!micOn).catch(() => setMicOn(false));
  };

  const handleVisualReady = useCallback((name) => {
    if (name === stateRef.current.sceneName) setVisualReady(true);
  }, []);
  const handleHiidWetMixChange = useCallback((value) => stateRef.current.engine?.setHiidWetMix(value), []);
  const handleHiidDryMixChange = useCallback((value) => stateRef.current.engine?.setHiidDryMix(value), []);

  const scale = screenScale(viewport);
  const instrumentScale = Math.min(
    viewport.width / INSTRUMENT_SIZE.width,
    viewport.height / 2 / INSTRUMENT_SIZE.height,
  );
  const SceneComp = SCENES[sceneName];
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
    >
      <InstrumentOpenContext.Provider value={showInstrument}>
        <SceneComp
          key={sceneName}
          active
          onVisualReady={handleVisualReady}
          onHiidWetMixChange={handleHiidWetMixChange}
          onHiidDryMixChange={handleHiidDryMixChange}
          externalAudio={{ meterNode: engine?.meterNode || null }}
        />
      </InstrumentOpenContext.Provider>
      {!loading && (
        <div
          style={{
            position: 'absolute',
            zIndex: 200,
            left: parseFloat(uiTheme.scene.screenMargin) * scale,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: TOGGLE_SIZE / 4,
          }}
        >
          <Toggle icon="fa-hand-pointer" label="Instrument" onClick={toggleInstrument} />
          <Toggle icon={micOn ? 'fa-microphone' : 'fa-microphone-slash'} label="Microphone" onClick={toggleMicrophone} />
          <Toggle icon="fa-arrow-right-arrow-left" label="Change scene" onClick={nextScene} />
        </div>
      )}
      {showInstrument && (
        <iframe
          src="instrument.html"
          title="Instrument"
          ref={(el) => ipcRenderer.connect(el?.contentWindow ?? null)}
          style={{
            position: 'absolute',
            zIndex: 300,
            left: '50%',
            bottom: 0,
            width: INSTRUMENT_SIZE.width,
            height: INSTRUMENT_SIZE.height,
            border: 0,
            transform: `translateX(-50%) scale(${instrumentScale})`,
            transformOrigin: '50% 100%',
          }}
        />
      )}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1000,
            background: uiTheme.colors.loadingOverlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: uiTheme.typography.familyDisplay,
              fontWeight: uiTheme.typography.weightDisplay,
              fontSize: 52 * scale,
              letterSpacing: '0.03em',
              backgroundImage: uiTheme.typography.pearlGradient,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
              textShadow: uiTheme.typography.pearlShadow,
            }}
          >
            Loading…
          </div>
        </div>
      )}
    </div>
  );
};
