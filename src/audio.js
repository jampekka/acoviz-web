// The exhibition's audio processing as a Web Audio graph. Its filters are linear, so the page
// applies their impulse responses, rendered from the exhibition's scene definitions by
// csound/render_responses.csd, by convolution.

// Each scene's initial mix of its processing (wet) and of the processing's input (dry).
const SCENES = {
  Siliavuori: { wet: 1, dry: 0 },
  Hiidenkirnukivi: { wet: 0, dry: 0.5 },
  Pirunkirkko: { wet: 1, dry: 0 },
};
// The top velocities of the velocity layers of the FluidR3 GM kit notes that the instrument
// plays, rendered with the exhibition's FluidSynth setup by csound/render_drums.csd.
const DRUM_LAYERS = { 36: [80, 88, 96, 104, 112, 120, 127], 48: [127] };

const SAMPLE_RATE = 48000;
const MASTER_GAIN = 8; // in place of the exhibition's amplifier: a full drum hit peaks near -6 dBFS
const MIC_GAIN = 0.1;
const TOUCH_SEND_GAIN = 0.25; // to the scene's processing and directly to the output alike
const DRUM_GAIN = 2;
// The instrument reaches Hiidenkirnukivi at these fractions of its level elsewhere.
const HIID_TOUCH_WET = 0.5;
const HIID_TOUCH_DRY = 0.1;
// The touch instrument's sine voices, times in seconds.
const VOICE = { amp: 0.1, attack: 0.2, decay: 0.16, sustain: 0.75, release: 0.3, freqLag: 0.01, ampLag: 0.02 };
const CONTROL_RAMP = 0.1; // the exhibition's lag with a 0.03 s half-time gets 90 % of the way in this time
const METER_CUTOFF_HZ = 10;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
// The voices' lags are times to get halfway to the target, setTargetAtTime's time constants.
const timeConstant = (halfTime) => halfTime / Math.LN2;

class SceneAudioEngine {
  static async create() {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    const load = async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Failed to load ${path}`);
      return context.decodeAudioData(await response.arrayBuffer());
    };
    const loadAll = async (names, path) => Object.fromEntries(await Promise.all(
      names.map(async (name) => [name, await load(path(name))]),
    ));
    const [responses, drums] = await Promise.all([
      loadAll([...Object.keys(SCENES), 'dcblock'], (name) => `assets/responses/${name.toLowerCase()}.wav`),
      loadAll(
        Object.entries(DRUM_LAYERS).flatMap(([note, layers]) => layers.map((top) => `${note}_${top}`)),
        (name) => `assets/drums/${name}.wav`,
      ),
    ]);
    return new SceneAudioEngine(context, responses, drums);
  }

  constructor(context, responses, drums) {
    this.audioContext = context;
    this.drums = drums;
    this.voices = new Map();
    this.microphone = null;
    this.meterNode = new EventTarget();

    const gain = (value) => new GainNode(context, { gain: value });
    // The responses carry their own levels.
    const convolver = (buffer) => new ConvolverNode(context, { buffer, disableNormalization: true });

    const output = gain(MASTER_GAIN);
    output.connect(context.destination);

    // Drums and touch voices, then the DC blocker.
    this.instrument = gain(1);
    const touch = convolver(responses.dcblock);
    this.instrument.connect(touch);
    // The two channels of the microphone are averaged.
    this.microphoneInput = new GainNode(context, { gain: MIC_GAIN, channelCount: 1, channelCountMode: 'explicit' });

    const sceneInput = gain(1);
    this.touchWet = gain(TOUCH_SEND_GAIN);
    this.touchDry = gain(TOUCH_SEND_GAIN);
    touch.connect(this.touchWet).connect(sceneInput);
    touch.connect(this.touchDry).connect(output);
    this.microphoneInput.connect(sceneInput);
    this.microphoneInput.connect(output);

    this.scenes = {};
    for (const [name, mix] of Object.entries(SCENES)) {
      const scene = { level: gain(0), wet: gain(mix.wet), dry: gain(mix.dry) };
      sceneInput.connect(convolver(responses[name])).connect(scene.wet).connect(scene.level);
      sceneInput.connect(scene.dry).connect(scene.level);
      scene.level.connect(output);
      this.scenes[name] = scene;
    }

    // The input level that moves the scenes, as the exhibition measured it: the square
    // root of the low-pass filtered square of the signal.
    const square = gain(0);
    for (const input of [touch, this.microphoneInput]) {
      input.connect(square);
      input.connect(square.gain);
    }
    const b = 2 - Math.cos(2 * Math.PI * METER_CUTOFF_HZ / SAMPLE_RATE);
    const pole = b - Math.sqrt(b * b - 1);
    const meanSquare = new IIRFilterNode(context, { feedforward: [1 - pole], feedback: [1, -pole] });
    const meter = new AnalyserNode(context, { fftSize: 32 });
    // The silent connection to the output keeps the meter running.
    square.connect(meanSquare).connect(meter).connect(gain(0)).connect(output);
    const samples = new Float32Array(meter.fftSize);
    const pollMeter = () => {
      meter.getFloatTimeDomainData(samples);
      const inputRms = Math.sqrt(Math.max(0, samples[samples.length - 1]));
      this.meterNode.dispatchEvent(new CustomEvent('frame', { detail: { inputRms } }));
      requestAnimationFrame(pollMeter);
    };
    pollMeter();
  }

  // Browsers allow audio only after a user gesture, so every input starts it.
  start() {
    return this.audioContext.resume();
  }

  // A ramp from the current value. Unlike an exponential approach, it does not depend on
  // the node having been processing audio in the meantime.
  setControl(param, value) {
    const now = this.audioContext.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + CONTROL_RAMP);
  }

  activateScene(sceneName) {
    for (const [name, scene] of Object.entries(this.scenes)) {
      this.setControl(scene.level.gain, name === sceneName ? 1 : 0);
    }
    const hiid = sceneName === 'Hiidenkirnukivi';
    this.setControl(this.touchWet.gain, TOUCH_SEND_GAIN * (hiid ? HIID_TOUCH_WET : 1));
    this.setControl(this.touchDry.gain, TOUCH_SEND_GAIN * (hiid ? HIID_TOUCH_DRY : 1));
  }

  setHiidWetMix(value) {
    this.setControl(this.scenes.Hiidenkirnukivi.wet.gain, clamp(value, 0, 1));
  }

  setHiidDryMix(value) {
    this.setControl(this.scenes.Hiidenkirnukivi.dry.gain, clamp(value, 0, 2));
  }

  async setVirtualTouch({ slot = 1, active = 1, freqHz = 220, pressure = 1 } = {}) {
    await this.start();
    const context = this.audioContext;
    const now = context.currentTime;
    let voice = this.voices.get(slot);
    if (!active) {
      if (!voice) return;
      this.voices.delete(slot);
      // The release starts from the envelope's current level.
      const elapsed = now - voice.start;
      const level = elapsed < VOICE.attack
        ? elapsed / VOICE.attack
        : 1 - (1 - VOICE.sustain) * Math.min(1, (elapsed - VOICE.attack) / VOICE.decay);
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setValueAtTime(VOICE.amp * level, now);
      voice.envelope.gain.linearRampToValueAtTime(0, now + VOICE.release);
      voice.oscillator.stop(now + VOICE.release);
      return;
    }
    if (!voice) {
      // Frequency and pressure glide from zero, as in the exhibition.
      voice = {
        start: now,
        oscillator: new OscillatorNode(context, { frequency: 0 }),
        pressure: new GainNode(context, { gain: 0 }),
        envelope: new GainNode(context, { gain: 0 }),
      };
      voice.envelope.gain.setValueAtTime(0, now);
      voice.envelope.gain.linearRampToValueAtTime(VOICE.amp, now + VOICE.attack);
      voice.envelope.gain.linearRampToValueAtTime(VOICE.amp * VOICE.sustain, now + VOICE.attack + VOICE.decay);
      voice.oscillator.connect(voice.pressure).connect(voice.envelope).connect(this.instrument);
      voice.oscillator.start(now);
      this.voices.set(slot, voice);
    }
    voice.oscillator.frequency.setTargetAtTime(clamp(freqHz, 20, 4000), now, timeConstant(VOICE.freqLag));
    voice.pressure.gain.setTargetAtTime(clamp(pressure, 0, 1), now, timeConstant(VOICE.ampLag));
  }

  stopVirtualInstrument(slot = 1) {
    return this.setVirtualTouch({ slot, active: 0 });
  }

  // Like FluidSynth, plays the note's velocity layer scaled by velocity squared.
  async triggerDrum(midiNote = 36, velocity = 1) {
    await this.start();
    const midiVelocity = Math.floor(1 + 126 * clamp(velocity, 0, 1));
    const top = DRUM_LAYERS[midiNote].find((layer) => layer >= midiVelocity);
    const hit = new AudioBufferSourceNode(this.audioContext, { buffer: this.drums[`${midiNote}_${top}`] });
    hit.connect(new GainNode(this.audioContext, { gain: DRUM_GAIN * (midiVelocity / top) ** 2 })).connect(this.instrument);
    hit.start();
  }

  // The raw microphone signal, processed locally as the exhibition's audio interface input was.
  async setMicrophone(on) {
    await this.start();
    if (this.microphone) {
      this.microphone.source.disconnect();
      this.microphone.stream.getTracks().forEach((track) => track.stop());
      this.microphone = null;
    }
    if (!on) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.microphoneInput);
    this.microphone = { stream, source };
  }
}

module.exports = { SceneAudioEngine };
