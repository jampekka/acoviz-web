const { useEffect, useRef } = require('react');
const { useJackMeter } = require('./useJackGraph.js');

function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function emaStep(y, x, dt, tau) {
  const alpha = 1 - Math.exp(-Math.max(0.000001, dt) / Math.max(0.000001, tau || 0.001));
  return y + alpha * (x - y);
}
function dbToLin(db) { return Math.pow(10, db / 20); }
function linToDb(lin) { return lin > 0 ? 20 * Math.log10(lin) : -120; }

// Linear progress controller: feed linear amplitude values (e.g., RMS/peak)
// Supports threshold as:
// - single value: hard sign at that level
// - [low, high]: linear ramp 0..+1 between low..high, -1 below (one-width extrapolation)
// - [low, mix, high]: gate=-1 at low, 0 at mix, +1 at high; linear between segments
// Applies short smoothing and integrates progress using rateUp/rateDown.
function createLinearProgressController(opts = {}) {
  const {
    tauSmooth = 0.15,
    // threshold can be number | [low, high] | [low, mix, high]; negatives interpreted as dBFS, positives as linear
    threshold = [-50, -30],
    rateUp = 0.015,
    rateDown = 0.0,
    minProgress = 0.0,
    maxProgress = 1.0,
    paused = false,
  } = opts;

  const thrArr = Array.isArray(threshold) ? threshold.slice(0, 3) : [threshold];
  // Convert to linear units
  const thrLin = thrArr.map(v => (v < 0 ? dbToLin(v) : v));

  // Ensure monotonic non-decreasing order for 3-point mapping
  if (thrLin.length === 3) {
    if (!(thrLin[0] <= thrLin[1] && thrLin[1] <= thrLin[2])) {
      thrLin.sort((a, b) => a - b);
    }
  }

  const useThreePoint = (thrLin.length === 3);

  // Back-compat: for 1 or 2 thresholds, keep previous two-point behavior
  let thrLin0, thrLin1, thrLin2;
  if (useThreePoint) {
    [thrLin0, thrLin1, thrLin2] = thrLin;
  } else {
    const [t0, t1Raw] = Array.isArray(threshold) ? threshold : [threshold, threshold];
    thrLin0 = (t0 < 0) ? dbToLin(t0) : t0;
    const t1 = (t1Raw < 0) ? dbToLin(t1Raw) : t1Raw;
    thrLin1 = t1;
  }

  const stateRef = { current: { smoothed: 0, gate: 0, progress: 0, rateUp, rateDown, thr0: thrLin0 ?? 0, thr1: thrLin1 ?? 0, thr2: thrLin2 ?? undefined, ramp: 0, paused } };
  const smoothRef = { current: 0 };
  const accumRef = { current: clamp01(lerp(minProgress, maxProgress, 0)) };

  function update(x, dtSec) {
    if(stateRef.current.paused) {
      return stateRef.current;
    }
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      return stateRef.current;
    }
    // Smooth linear input
    const smoothed = smoothRef.current = emaStep(smoothRef.current, Math.max(0, x || 0), dtSec, tauSmooth);

    let gate = 0;

    if (useThreePoint) {
      // Three-threshold mapping: low->-1, mix->0, high->+1
      const low = thrLin0;
      const mid = thrLin1;
      const high = thrLin2;
      const w0 = Math.max(0, mid - low);
      const w1 = Math.max(0, high - mid);
      if (smoothed <= low) {
        gate = -1;
      } else if (smoothed < mid) {
        gate = (w0 > 1e-12) ? (-1 + (smoothed - low) / w0) : 0; // -1..0
      } else if (smoothed < high) {
        gate = (w1 > 1e-12) ? ((smoothed - mid) / w1) : 1; // 0..+1
      } else {
        gate = 1;
      }
    } else {
      // Previous two-point behavior
      const low = thrLin0;
      const high = thrLin1;
      if (low > high) throw new Error('useAudioProgress: threshold low > high');
      const width = Math.max(0, high - low);
      if (width <= 1e-12) {
        // Degenerate: behave like a hard sign
        gate = (smoothed >= low) ? 1 : -1;
      } else {
        const t = (smoothed - low) / width; // t: -1 at (low-width), 0 at low, 1 at high
        gate = Math.max(-1, Math.min(1, t));
      }
    }

    // Ramp speed: positive uses rateUp, negative uses rateDown
    const v = gate === 0 ? 0 : (gate > 0 ? gate * rateUp : gate * rateDown);

    // Integrate and clamp
    const next = clamp01(accumRef.current + v * dtSec);
    accumRef.current = next;

    stateRef.current = { smoothed, gate, progress: next, rateUp, rateDown, thr0: thrLin0 ?? 0, thr1: thrLin1 ?? 0, thr2: thrLin2 ?? undefined, ramp: v, paused };
    return stateRef.current;
  }

  return { update, stateRef };
}

// React hook: subscribe to a meter source and compute progress over time in linear units.
// Returns a ref with { smoothed, gate, progress, rateUp, rateDown, thr0, thr1, thr2?, ramp }.
function useAudioProgress(source, opts = {}) {
  const meterRef = useJackMeter(source || null, { rateHz: opts.rateHz ?? 30 });
  const ctrlRef = useRef(createLinearProgressController(opts));
  const stateRef = useRef({ smoothed: 0, gate: 0, progress: 0, rateUp: opts.rateUp ?? 0, rateDown: opts.rateDown ?? 0, thr0: 0, thr1: 0, thr2: undefined, ramp: 0 });
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  // Normalize threshold into scalars to avoid array-identity churn in deps
  const thrArr = Array.isArray(opts.threshold) ? opts.threshold : [opts.threshold];
  const depThr0 = Number.isFinite(thrArr[0]) ? thrArr[0] : 0;
  const depThr1 = Number.isFinite(thrArr[1]) ? thrArr[1] : depThr0;
  const depThr2 = Number.isFinite(thrArr[2]) ? thrArr[2] : depThr1;
  const depPaused = Boolean(opts.paused);
  const depResetKey = opts.resetKey;

  useEffect(() => {
    ctrlRef.current = createLinearProgressController({
      ...opts,
      threshold: thrArr.length ? thrArr : undefined,
      paused: depPaused,
    });
    stateRef.current = ctrlRef.current.stateRef.current;
    lastTsRef.current = 0;
  }, [opts.tauSmooth, depThr0, depThr1, depThr2, opts.rateUp, opts.rateDown, opts.minProgress, opts.maxProgress, depPaused, depResetKey]);

  useEffect(() => {
    let mounted = true;
    const loop = (ts) => {
      const dt = lastTsRef.current ? Math.max(0, (ts - lastTsRef.current) / 1000) : 0.016;
      lastTsRef.current = ts;
      const frame = meterRef.current || { rms: 0 };
      const x = Number.isFinite(frame.inputRms) ? frame.inputRms : (frame.rms || 0);
      const st = ctrlRef.current.update(x, dt);
      if (mounted) stateRef.current = st;
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => { mounted = false; window.cancelAnimationFrame(rafRef.current); };
  }, [source]);

  return stateRef;
}

module.exports = { createLinearProgressController, useAudioProgress, linToDb };
