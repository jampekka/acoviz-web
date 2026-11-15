const { useJackMeter } = require('../src/useJackGraph.js');
const THREE = require('three');
const uiTheme = require('../src/uiTheme.js');

const React = require('react');

const wrapperStyle = {
  position: 'fixed',
  left: 0,
  top: 0,
  transformOrigin: '0 0',
  zIndex: 100,
  margin: 0,
  padding: 0,
  background: 'transparent',
  color: uiTheme.colors.textPrimary,
  fontFamily: uiTheme.typography.familyBody,
  fontWeight: uiTheme.typography.weightBody,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const scPearlTextStyle = {
  fontFamily: uiTheme.typography.familyDisplay,
  fontWeight: uiTheme.typography.weightDisplay,
  letterSpacing: '0.01em',
  backgroundImage: uiTheme.typography.pearlGradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  textShadow: uiTheme.typography.pearlShadow,
};

const titleStyle = {
  position: 'absolute',
  top: uiTheme.scene.screenMargin,
  left: '50%',
  transform: 'translateX(-50%)',
  width: uiTheme.scene.titleWidth,
  fontSize: '72px',
  lineHeight: 1.0,
  textAlign: 'center',
  background: uiTheme.gradients.sceneTitlePlate,
  border: `1px solid ${uiTheme.colors.panelBorderWarm}`,
  borderRadius: '16px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  padding: '0.25em 0.6em 0.40em',
};

const instructionBoxStyle = {
  position: 'absolute',
  left: uiTheme.scene.screenMargin,
  bottom: uiTheme.scene.panelBottom,
  width: uiTheme.scene.panelLeftWidth,
  background: uiTheme.gradients.scenePanel,
  color: uiTheme.colors.textPrimary,
  border: `1px solid ${uiTheme.colors.panelBorderWarm}`,
  boxShadow: '0 14px 28px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(1.1px)',
  padding: '1.1em 1.2em',
  lineHeight: 1.28,
  zIndex: 100,
  fontSize: 42,
  fontWeight: uiTheme.typography.weightBody,
  pointerEvents: 'none',
  borderRadius: '18px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  height: 'auto',
  minHeight: '0',
  maxHeight: '90%',
};

const instructionSectionTitleStyle = {
  fontFamily: uiTheme.typography.familyDisplay,
  fontWeight: uiTheme.typography.weightDisplay,
  letterSpacing: '0.01em',
  color: uiTheme.colors.textPrimary,
  margin: '0.08em 0 0',
  fontSize: '1.72em',
  lineHeight: 1.03,
};

const instructionRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.74em',
  margin: '0.72em 0',
};

const instructionIconStyle = {
  width: '1.84em',
  minWidth: '1.84em',
  textAlign: 'center',
  lineHeight: 1,
  fontSize: '1.92em',
  opacity: 0.98,
  marginTop: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const instructionIconPearlStyle = {
  display: 'inline-block',
  backgroundImage: uiTheme.typography.pearlGradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  textShadow: 'none',
};

const instructionRowTextStyle = {
  fontSize: '1.24em',
  lineHeight: 1.16,
  color: uiTheme.colors.textPrimary,
  minHeight: '2.3em',
  display: 'flex',
  alignItems: 'center',
};

function instructionIconClass(name) {
  switch (String(name || '').toLowerCase()) {
    case 'forward': return 'fa-forward';
    case 'backward': return 'fa-backward';
    case 'microphone': return 'fa-microphone';
    case 'drum': return 'fa-drum';
    case 'touch': return 'fa-hand-pointer';
    case 'sliders': return 'fa-sliders';
    case 'gem': return 'fa-gem';
    case 'pitch': return 'fa-arrows-up-down';
    case 'music': return 'fa-music';
    case 'echo': return 'fa-wifi';
    case 'burst': return 'fa-burst';
    case 'clock': return 'fa-clock';
    case 'clap': return 'fa-hands-clapping';
    default: return 'fa-circle';
  }
}

function InstructionRow({ icon, children }) {
  const iconClass = instructionIconClass(icon);
  return (
    <div style={instructionRowStyle}>
      <span style={instructionIconStyle} aria-hidden>
        <i className={`fa-solid ${iconClass}`} style={instructionIconPearlStyle} />
      </span>
      <div style={instructionRowTextStyle}>{children}</div>
    </div>
  );
}

function InstructionSectionTitle({ children }) {
  return (
    <div style={{ marginBottom: '0.24em' }}>
      <div style={instructionSectionTitleStyle}>{children}</div>
      <div
        style={{
          width: '2.8em',
          height: '2px',
          margin: '0.22em 0 0.38em',
          borderRadius: '2px',
          background: 'rgba(255, 255, 255, 0.48)',
          boxShadow: '0 0 6px rgba(255, 255, 255, 0.18)',
        }}
      />
    </div>
  );
}

function useViewport() {
  const measure = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [viewport, setViewport] = React.useState(measure);
  React.useEffect(() => {
    const onResize = () => setViewport(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

// Overlays are laid out for the exhibition screen and scaled to keep their proportions on
// other screens.
const EXHIBITION_SCREEN = { width: 1920, height: 1080 };

function screenScale({ width, height }) {
  return Math.min(width, height) / EXHIBITION_SCREEN.height;
}

// The browser shows the exhibition's touchscreen instrument over the scene. It takes the
// place of the instruction panel while open.
const InstrumentOpenContext = React.createContext(false);

function InstructionPanel({ progress, scene, extras = null }) {
  const scale = screenScale(useViewport());
  const instrumentOpen = React.useContext(InstrumentOpenContext);
  const fadeStart = 0.05;
  const fadeEnd = 0.10;
  const opacity = interpolate([fadeStart, 1.0], [fadeEnd, 0.0])(progress ?? 0);
  const ws = Object.assign({}, wrapperStyle, {
    opacity,
    width: `${100 / scale}%`,
    height: `${100 / scale}%`,
    transform: `scale(${scale})`,
  });
  const rightPanelStyle = Object.assign({}, instructionBoxStyle, {
    fontSize: 30,
    left: 'auto',
    right: uiTheme.scene.screenMargin,
    // At least as wide as on the exhibition screen, also on narrower screens.
    width: `max(${uiTheme.scene.panelRightWidth}, ${parseFloat(uiTheme.scene.panelRightWidth) / 100 * EXHIBITION_SCREEN.width}px)`,
  });
  return (
    <div style={ws}>
      <div style={titleStyle}>
        <div style={scPearlTextStyle}>{scene}</div>
      </div>
      {!instrumentOpen && (
        <div style={rightPanelStyle}>
          {extras}
        </div>
      )}
    </div>
  );
};

function camera_swayer(camera, opts = {}) {
  const defaults = {
    yawFreq: 0.04,
    yawAmp: THREE.MathUtils.degToRad(2),
    pitchFreq: 0.025,
    pitchAmp: THREE.MathUtils.degToRad(1),
    breathFreq: 0.1,
    breathAmp: 0.05
  };
  let lastTs = null;
  let yawPhase = 0;
  let pitchPhase = 0;
  const swayFn = function sway(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) * 0.001;
    lastTs = ts;
    yawPhase += dt * swayFn.yawFreq;
    pitchPhase += dt * swayFn.pitchFreq;
    const swayYaw = Math.sin(yawPhase * 2 * Math.PI) * swayFn.yawAmp;
    const swayPitch = Math.sin(pitchPhase * 2 * Math.PI) * swayFn.pitchAmp;
    camera.rotation.set(swayPitch, swayYaw, 0, 'YXZ');
    camera.position.y = Math.sin(ts * 0.001 * 2 * Math.PI * swayFn.breathFreq) * swayFn.breathAmp;
  };
  Object.assign(swayFn, { ...defaults, ...opts });
  return swayFn;
}

/**
 * Creates a linear interpolator function for given x and y arrays.
 * Returns a function f(t) that linearly interpolates y for t in [x[0], x[x.length-1]].
 * x and y must be arrays of equal length, x must be sorted ascending.
 * For t outside x range, returns edge y value.
 */
function interp1d(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
    throw new Error('x and y must be arrays of equal length >= 2');
  }
  return function(t) {
    if (t <= x[0]) return y[0];
    if (t >= x[x.length - 1]) return y[y.length - 1];
    for (let i = 1; i < x.length; ++i) {
      if (t < x[i]) {
        const t0 = x[i - 1], t1 = x[i];
        const y0 = y[i - 1], y1 = y[i];
        const alpha = (t - t0) / (t1 - t0);
        return y0 + alpha * (y1 - y0);
      }
    }
    // Should not reach here, but return last y value as fallback
    return y[y.length - 1];
  };
}

/**
 * Creates a linear 1D interpolator from a list of [x, y] pairs.
 * Usage: const f = interp1d([0, 0], [0.5, 0], [0.6, 1], [1, 1]); f(t)
 * x values must be sorted ascending, at least 2 pairs required.
 */
function interpolate(...pairs) {
  if (pairs.length < 2 || !pairs.every(p => Array.isArray(p) && p.length === 2)) {
    throw new Error('interp1d requires at least two [x, y] pairs');
  }
  const x = pairs.map(p => p[0]);
  const y = pairs.map(p => p[1]);
  for (let i = 1; i < x.length; ++i) {
    if (x[i] < x[i - 1]) throw new Error('x values must be sorted ascending');
  }
  return interp1d(x, y);
}

const defaultProgressConfig = {
  tauSmooth: 0.5,
  threshold: [-75, -70, -65], // dBFS
  // Primary speed knob for forward scene movement.
  rateUp: 0.05,
  rateDown: 0.1,
};

const sceneProgressConfigs = {
  Siliavuori: { ...defaultProgressConfig, threshold: [...defaultProgressConfig.threshold] },
  Hiidenkirnukivi: { ...defaultProgressConfig, threshold: [...defaultProgressConfig.threshold] },
  Pirunkirkko: { ...defaultProgressConfig, threshold: [...defaultProgressConfig.threshold] },
};

// Global FOV response for input meter (mic + virtual instrument), shared across scenes.
const inputFovResponseConfig = {
  baseFov: 75,
  rmsDbOffset: 90,
  rmsDbRange: 55,
  fovDelta: 0.5,
  smoothTauSec: 0.05,
};

const postFxConfig = {
  afterimageDamp: 0.88,
};

function computeInputReactiveFov(frame, cfg = inputFovResponseConfig) {
  const inputRms = Number.isFinite(frame?.inputRms)
    ? Number(frame.inputRms)
    : (Number.isFinite(frame?.rms) ? Number(frame.rms) : 0);
  const rmsDb = inputRms > 0 ? 20 * Math.log10(inputRms) : -120;
  const rmsNorm = THREE.MathUtils.clamp((rmsDb + cfg.rmsDbOffset) / cfg.rmsDbRange, 0, 1);
  return cfg.baseFov - (cfg.fovDelta * rmsNorm);
}

function smoothToward(current, target, dtSec, tauSec) {
  const dt = Math.max(0, Number.isFinite(Number(dtSec)) ? Number(dtSec) : 0);
  const tau = Math.max(1e-4, Number.isFinite(Number(tauSec)) ? Number(tauSec) : 1e-4);
  const alpha = 1 - Math.exp(-dt / tau);
  return current + (target - current) * alpha;
}

module.exports = {
  useViewport,
  screenScale,
  InstrumentOpenContext,
  InstructionPanel,
  InstructionRow,
  InstructionSectionTitle,
  useJackMeter,
  camera_swayer,
  interpolate,
  sceneProgressConfigs,
  inputFovResponseConfig,
  postFxConfig,
  computeInputReactiveFov,
  smoothToward,
};
