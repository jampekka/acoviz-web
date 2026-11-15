const React = require('react');
const { useState } = React;
const {
  useJackMeter,
  interpolate,
  camera_swayer,
  InstructionPanel,
  InstructionRow,
  InstructionSectionTitle,
  sceneProgressConfigs,
  inputFovResponseConfig,
  postFxConfig,
  computeInputReactiveFov,
  smoothToward,
} = require('./common.js');
const { useAudioProgress } = require('../src/useAudioProgress.js');
const THREE = require('three');
const { MasterPostprocessing } = require('./postprocessing.js');

// Hiidenkirnukivi scene tuning knobs (keep all scene-specific values here).
const HIID_SETTINGS = {
  meterRateHz: 30,
  audioProgress: {
    tauSmooth: sceneProgressConfigs.Hiidenkirnukivi.tauSmooth,
    threshold: Array.isArray(sceneProgressConfigs.Hiidenkirnukivi?.threshold)
      ? [...sceneProgressConfigs.Hiidenkirnukivi.threshold]
      : sceneProgressConfigs.Hiidenkirnukivi?.threshold,
    rateUp: sceneProgressConfigs.Hiidenkirnukivi.rateUp,
    rateDown: sceneProgressConfigs.Hiidenkirnukivi.rateDown,
  },
  camera: {
    baseFov: inputFovResponseConfig.baseFov,
    near: 0.1,
    far: 1000,
  },
  post: {
    gain: 1.0,
    warpGain: 1.0,
    flameGain: 1.0,
    speed: 10.0,
    afterimageDamp: postFxConfig.afterimageDamp,
  },
  // Centralized progress transition points (where behavior starts/ends changing).
  progressRanges: {
    pose: [0.0, 0.3],
    postGain: [0.6, 1.0],
    headSway: [0.2, 0.4],
    crossfade: [0.1, 0.3],
  },
  fovResponse: {
    ...inputFovResponseConfig,
  },
  // Centralized Hiidenkirnukivi dry/wet crossfade gains.
  crossfadeGains: {
    dryStart: 0.5,
    dryEnd: 0.0,
    wetStart: 0.0,
    wetEnd: 1.0,
    updateEpsilon: 0.002,
  },
  headSway: {
    yawAmpDegBase: 2,
    yawAmpDegRange: 90,
    yawFreqBase: 0.04,
    yawFreqRange: 0.05,
    pitchAmpDegBase: 1,
    pitchAmpDegRange: 45,
    pitchFreqBase: 0.025,
    pitchFreqRange: 0.05,
  },
  pose: {
    start: {
      x: -5.277768551229443,
      y: 0.14726847410202026,
      z: 0.7585939431547186,
      yaw: -7.729999999999977,
      pitch: 0.16920367320510288,
      roll: 0,
    },
    end: {
      x: 0.37236306203988123,
      y: 0.14726847410202026,
      z: -0.12091208059338004,
      yaw: -7.894999999999978,
      pitch: 0.1342036732051029,
      roll: 0,
    },
  },
};

module.exports = function Hiidenkirnukivi(props) {
  const {
    onVisualReady,
    active = true,
    externalAudio = null,
    onHiidWetMixChange = null,
    onHiidDryMixChange = null,
  } = props;
  const activeRef = React.useRef(Boolean(active));
  const visualReadyRef = React.useRef(false);
  const lastWetMixRef = React.useRef(-1);
  const lastDryMixRef = React.useRef(-1);
  const baseFovRef = React.useRef(HIID_SETTINGS.camera.baseFov);
  const meterNode = externalAudio?.meterNode || null;

  React.useEffect(() => {
    activeRef.current = Boolean(active);
    setProgressState(0);
  }, [active]);

  const meterRef = useJackMeter(meterNode || null, { rateHz: HIID_SETTINGS.meterRateHz });
  const progRef = useAudioProgress(meterNode, {
    ...HIID_SETTINGS.audioProgress,
    paused: !active,
    resetKey: active ? 'hiid-active' : 'hiid-inactive',
  });

  const [progressState, setProgressState] = useState(0);

  const mountRef = React.useRef(null);
  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer, scene, camera, model;
    let post = null;
    let frameId;
    let handleResize;
    // Legacy interactive camera movement controls are intentionally disabled.

    const start_pose = HIID_SETTINGS.pose.start;
    const end_pose = HIID_SETTINGS.pose.end;

    // const onDown = ...
    // const onUp = ...
    // const onMove = ...
    // const onKey = ...

    const failAsync = (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setTimeout(() => { throw error; }, 0);
    };

    (async () => {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
      });
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        HIID_SETTINGS.camera.baseFov,
        mount.clientWidth / mount.clientHeight,
        HIID_SETTINGS.camera.near,
        HIID_SETTINGS.camera.far
      );
      baseFovRef.current = camera.fov;
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('assets/hiidenkirnukivi/hiidenkirnukivi.gltf');
      if (!renderer || !scene || !camera) return;
      model = gltf.scene;
      scene.add(model);
      const body = new THREE.Object3D();
      body.position.set(start_pose.x, start_pose.y, start_pose.z);
      body.rotation.set(start_pose.pitch, start_pose.yaw, start_pose.roll, 'YXZ');
      body.add(camera);
      scene.add(body);

      post = new MasterPostprocessing({ renderer, scene, camera, useFlames: true });
      post.gain = HIID_SETTINGS.post.gain;
      post.afterimageGain = HIID_SETTINGS.post.afterimageDamp;
      post.warpGain = HIID_SETTINGS.post.warpGain;
      post.flameGain = HIID_SETTINGS.post.flameGain;
      post.speed = HIID_SETTINGS.post.speed;

      handleResize = () => {
        if (!renderer || !camera || !post) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        post.resize(w, h);
        if (camera.isPerspectiveCamera || camera.isOrthographicCamera) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      };
      window.addEventListener('resize', handleResize);
      handleResize();

      const swayer = camera_swayer(camera);
      const lerp = (a, b, t) => a + (b - a) * t;

      let prevVals = null;
      let prevTs = 0;
      const animate = (ts) => {
        frameId = requestAnimationFrame(animate);
        if (!camera || !activeRef.current) return;
        const dt = Math.max(0, (ts - prevTs) / 1000) || 0;
        prevTs = ts;
        const progress = typeof progRef?.current?.progress === 'number' ? progRef.current.progress : 0;
        const p = Math.max(0, Math.min(1, progress));
        const [crossfadeStart = 0.30, crossfadeEnd = 0.40] = HIID_SETTINGS.progressRanges.crossfade || [];
        const span = Math.max(1e-6, crossfadeEnd - crossfadeStart);
        const crossfadeT = Math.max(0, Math.min(1, (p - crossfadeStart) / span));
        const wetMix = lerp(HIID_SETTINGS.crossfadeGains.wetStart, HIID_SETTINGS.crossfadeGains.wetEnd, crossfadeT);
        const dryMix = lerp(HIID_SETTINGS.crossfadeGains.dryStart, HIID_SETTINGS.crossfadeGains.dryEnd, crossfadeT);
        if (typeof onHiidWetMixChange === 'function' && Math.abs(wetMix - lastWetMixRef.current) > HIID_SETTINGS.crossfadeGains.updateEpsilon) {
          lastWetMixRef.current = wetMix;
          onHiidWetMixChange(wetMix);
        }
        if (typeof onHiidDryMixChange === 'function' && Math.abs(dryMix - lastDryMixRef.current) > HIID_SETTINGS.crossfadeGains.updateEpsilon) {
          lastDryMixRef.current = dryMix;
          onHiidDryMixChange(dryMix);
        }
        setProgressState(p);
        const [poseStart = 0.0, poseEnd = 0.5] = HIID_SETTINGS.progressRanges.pose || [];
        const [gainStart = 0.6, gainEnd = 1.0] = HIID_SETTINGS.progressRanges.postGain || [];
        const [headStart = 0.4, headEnd = 0.5] = HIID_SETTINGS.progressRanges.headSway || [];
        const poseInterp = interpolate([poseStart, 0], [poseEnd, 1]);
        const gainInterp = interpolate([gainStart, 0.0], [gainEnd, 1.0]);
        const headInterp = interpolate([headStart, 0], [headEnd, 1]);
        const poseT = poseInterp(p);
        const pose = {
          x: lerp(start_pose.x, end_pose.x, poseT),
          y: lerp(start_pose.y, end_pose.y, poseT),
          z: lerp(start_pose.z, end_pose.z, poseT),
          yaw: lerp(start_pose.yaw, end_pose.yaw, poseT),
          pitch: lerp(start_pose.pitch, end_pose.pitch, poseT),
          roll: lerp(start_pose.roll, end_pose.roll, poseT)
        };
        body.position.set(pose.x, pose.y, pose.z);
        body.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');

        post.gain = gainInterp(p);
        post.time = ts / 1000.0;

        const headProg = headInterp(p);
        swayer.yawAmp = THREE.MathUtils.degToRad(HIID_SETTINGS.headSway.yawAmpDegBase + (HIID_SETTINGS.headSway.yawAmpDegRange * headProg));
        swayer.yawFreq = HIID_SETTINGS.headSway.yawFreqBase + (HIID_SETTINGS.headSway.yawFreqRange * headProg);
        swayer.pitchAmp = THREE.MathUtils.degToRad(HIID_SETTINGS.headSway.pitchAmpDegBase + (HIID_SETTINGS.headSway.pitchAmpDegRange * headProg));
        swayer.pitchFreq = HIID_SETTINGS.headSway.pitchFreqBase + (HIID_SETTINGS.headSway.pitchFreqRange * headProg);

        swayer(ts);
        const frame = meterRef.current || {};
        const targetFov = computeInputReactiveFov(frame, {
          ...HIID_SETTINGS.fovResponse,
          baseFov: baseFovRef.current,
        });
        const dtFov = dt > 0 ? dt : (1 / 60);
        const smoothedFov = smoothToward(
          camera.fov,
          targetFov,
          dtFov,
          HIID_SETTINGS.fovResponse.smoothTauSec
        );
        if (Math.abs(camera.fov - smoothedFov) > 1e-5) {
          camera.fov = smoothedFov;
          camera.updateProjectionMatrix();
        }
        if (!prevVals || Object.keys(pose).some((k) => Math.abs(pose[k] - prevVals[k]) > 1e-5)) {
          prevVals = { ...pose };
        }
        post.render();
      };
      animate(performance.now());
      if (!visualReadyRef.current) {
        visualReadyRef.current = true;
        if (typeof onVisualReady === 'function') onVisualReady('Hiidenkirnukivi');
      }
    })().catch(failAsync);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (renderer) {
        try { renderer.dispose(); } catch {}
        if (renderer.domElement && renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      }
      try { post?.dispose?.(); } catch {}
      if (model) {
        model.traverse(obj => {
          if (obj.geometry) { try { obj.geometry.dispose(); } catch {} }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => { try { m.dispose(); } catch {} });
            } else { try { obj.material.dispose(); } catch {} }
          }
          if (obj.texture) { try { obj.texture.dispose?.(); } catch {} }
        });
      }
      renderer = null;
      scene = null;
      camera = null;
      model = null;
      post = null;
      visualReadyRef.current = false;
    };
  }, [onVisualReady, onHiidWetMixChange, onHiidDryMixChange]);

  const extras = (
    <div>
      <InstructionSectionTitle>The stone resonates</InstructionSectionTitle>
      <InstructionRow icon="touch">Play the virtual drum</InstructionRow>
      <InstructionRow icon="touch">Touch the resonant string notes</InstructionRow>
      <InstructionRow icon="microphone">Hum the resonant notes</InstructionRow>
    </div>
  );

  return (<>
    <InstructionPanel
        scene="Humming Cavity of Hiidenkirnukivi"
        extras={extras}
        progress={progressState}
      >
      </InstructionPanel>
    <div ref={mountRef} style={{ position: 'fixed', width: '100%', height: '100%', margin: 0, padding: 0 }}>
      
    </div>
    </>
  );
};
