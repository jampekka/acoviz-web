const React = require('react');
const { useRef, useEffect, useState } = React;
const THREE = require('three');
const { InstructionPanel, camera_swayer, interpolate, sceneProgressConfigs } = require('./common.js');
const { useAudioProgress } = require('../src/useAudioProgress.js');
const { FrameScrubber } = require('../video_scrubber.js');
const { EffectComposer } = require('three/examples/jsm/postprocessing/EffectComposer.js');
const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');
const { ShaderPass } = require('three/examples/jsm/postprocessing/ShaderPass.js');
const { TranceShader } = require('./effects.js');
const { MasterPostprocessing } = require('./postprocessing.js');

// The exhibition's video, split into parts.
const VIDEO_PARTS = Array.from({ length: 6 }, (_part, i) => `assets/Pirunkirkko_keyframes/${i}.mp4`);

module.exports = function Pirunkirkko(props) {
  const { onVisualReady, externalAudio = null } = props;
  const meterNode = externalAudio?.meterNode || null;

  return React.createElement(AnimatedPirunkirkko, { meterNode, onVisualReady });
};

function AnimatedPirunkirkko({ initialYaw = -Math.PI / 2, meterNode = null, onVisualReady }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const textureRef = useRef(null);
  const composerRef = useRef(null);
  const yawRef = useRef(initialYaw);
  const pitchRef = useRef(0);
  const scrubberRef = useRef(null); // reuse as video controller ref
  const rafRef = useRef(0);

  const progRef = useAudioProgress(meterNode, sceneProgressConfigs.Pirunkirkko);
  const [progressState, setProgressState] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    sceneRef.current = scene;
    cameraRef.current = camera;

    // Add body object and attach camera
    const body = new THREE.Object3D();
    body.position.set(0, 0, 0);
    body.add(camera);
    scene.add(body);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Postprocessing with MasterPostprocessing
    const post = new MasterPostprocessing({ renderer, scene, camera, useFlames: true });
    post.gain = 1.0;
    post.warpGain = 0.0;
    post.flameGain = 1.0;
    post.speed = 10.0;

    const geometry = new THREE.SphereGeometry(40, 60, 40);
    geometry.scale(-1, 1, 1);

    // Create VideoPingpong and texture once loaded
    (async () => {
      try {
        const scrubber = new FrameScrubber({ src: VIDEO_PARTS });

        scrubberRef.current = scrubber;
        await scrubber.load();
        const texture = scrubber.texture;
        textureRef.current = texture;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = yawRef.current;
        meshRef.current = mesh;
        scene.add(mesh);
        camera.position.set(0, 0, 0.1);

        const render = () => {
          post.render();
        };

        const handleResize = () => {
          if (!mount) return;
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          post.resize(w, h);
          render();
        };
        window.addEventListener('resize', handleResize);

        // Interpolators for scrubber and post gain
        const scrubberInterp = interpolate([0.0, 0.0], [0.8, 0.8]); // progress 0.0-0.8 => scrubber 0.0-1.0
        const gainInterp = interpolate([0.7, 0.0], [1.0, 1.0]);     // progress 0.7-1.0 => gain 0.0-1.0
        
        const swayer = camera_swayer(camera);
        const animate = (ts) => {
          const t = ts / 1000.0;
          const progress = progRef.current?.progress ?? 0;
          setProgressState(progress);
          
          const scrubSway = interpolate([0.75, 0.0], [0.77, 1.0])(progress);
          post.afterimageGain = scrubSway*0.99;
          post.gain = scrubSway;
          post.time = t;
          const s = (t*0.1)%1;
          const scrubProgress = scrubberInterp(progress) + s*0.2*scrubSway;
          scrubber.setProgress(scrubProgress); // scrubber goes from 0 at 0.0 to 1 at 0.8

          const head_prog = scrubSway;
          swayer.yawAmp = THREE.MathUtils.degToRad(90 * head_prog + 2/90);
          swayer.yawFreq = 0.04 + 0.01 * head_prog;
          swayer.pitchAmp = THREE.MathUtils.degToRad(70 * head_prog + 1/90);
          swayer.pitchFreq = 0.025 + 0.01 * head_prog;

          swayer(ts);
          post.render();

          rafRef.current = window.requestAnimationFrame(animate);
        };
        rafRef.current = window.requestAnimationFrame(animate);

        // Indicate renderer is ready
        if (typeof onVisualReady === 'function') onVisualReady('Pirunkirkko');

        // Cleanup on unmount
        return () => {
          window.cancelAnimationFrame(rafRef.current);
          window.removeEventListener('resize', handleResize);
          geometry.dispose();
          material.dispose();
          texture.dispose?.();
          renderer.dispose();
          try { post.dispose?.(); } catch {}
          if (renderer.domElement && renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        };
      } catch (e) {
        console.error('Failed to initialize video', e);
      }
    })();

    // Fallback cleanup if async block didn't return a cleanup
    return () => {
      window.cancelAnimationFrame(rafRef.current);
      try { post.dispose?.(); } catch {}
      if (renderer && renderer.domElement && renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      try { renderer.dispose(); } catch {}
    };
  }, [initialYaw]);
  
  const extras = (<div>
    Devil's Church rings with the<br/>
    <b style={{ color: "rgb(235, 127, 127)" }}> █ red keys</b>!
    </div>
  );


  return (<>
    <InstructionPanel
        scene="Pirunkirkko"
        subtitle={"Ringing Cave of \"Devil's Church\""}
        extras={extras}
        progress={progressState}
    >
    </InstructionPanel>
    <div ref={mountRef} style={{ position: 'fixed', width: '100%', height: '100%', margin: 0, padding: 0 }}></div>
    </>
  );
}
