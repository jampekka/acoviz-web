const React = require('react');
const { useRef, useEffect, useState } = React;
const THREE = require('three');
const {
  useJackMeter,
  InstructionPanel,
  InstructionRow,
  InstructionSectionTitle,
  camera_swayer,
  interpolate,
  sceneProgressConfigs,
  inputFovResponseConfig,
  postFxConfig,
  computeInputReactiveFov,
  smoothToward,
} = require('./common.js');
const { useAudioProgress } = require('../src/useAudioProgress.js');
const { MasterPostprocessing } = require('./postprocessing.js');

module.exports = function Siliavuori(props) {
  const { onVisualReady, active = true, externalAudio = null } = props;
  const meterNode = externalAudio?.meterNode || null;

  return React.createElement(SiliavuoriVisual, {
    meterNode,
    active,
    onVisualReady,
  });
};

function SiliavuoriVisual({ meterNode = null, active = true, onVisualReady }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(Boolean(active));
  const visualReadyRef = useRef(false);
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const baseFovRef = useRef(inputFovResponseConfig.baseFov);
  const progressRef = useRef(0);
  const moveRef = useRef(0);
  const sphere_radius = 40.0;
  const initial_position = sphere_radius;
  const listener_position = useRef(initial_position);
  const [progressState, setProgressState] = useState(0);

  const meterRef = useJackMeter(meterNode || null, { rateHz: 30 });
  const progRef = useAudioProgress(meterNode, {
    ...sceneProgressConfigs.Siliavuori,
    paused: !active,
    resetKey: active ? 'sili-active' : 'sili-inactive',
  });

  useEffect(() => {
    activeRef.current = Boolean(active);
    setProgressState(0);
    progressRef.current = 0;
    moveRef.current = 0;
    const cam = cameraRef.current;
    if (cam) {
      cam.fov = baseFovRef.current;
      cam.updateProjectionMatrix();
    }
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let scene = null;
    let camera = null;
    let body = null;
    let renderer = null;
    let geometry = null;
    let material = null;
    let mesh = null;
    let post = null;
    let handleResize = null;
    const textures = [];

    const markVisualReady = () => {
      if (visualReadyRef.current) return;
      visualReadyRef.current = true;
      if (typeof onVisualReady === 'function') onVisualReady('Siliavuori');
    };

    const failAsync = (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setTimeout(() => { throw error; }, 0);
    };

    (async () => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(inputFovResponseConfig.baseFov, mount.clientWidth / mount.clientHeight, 0.1, 2000);
      baseFovRef.current = camera.fov;
      sceneRef.current = scene;
      cameraRef.current = camera;

      body = new THREE.Object3D();
      body.position.set(0, 0, 0);
      body.add(camera);
      scene.add(body);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      mount.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const textureLoader = new THREE.TextureLoader();
      const [tex, texOverlay] = await Promise.all([
        textureLoader.loadAsync('assets/Siliavuori_bg.webp'),
        textureLoader.loadAsync('assets/Siliavuori_painting.png'),
      ]);
      if (cancelled) {
        try { tex.dispose?.(); } catch {}
        try { texOverlay.dispose?.(); } catch {}
        return;
      }
      tex.magFilter = THREE.LinearFilter;
      textures.push(tex, texOverlay);

      geometry = new THREE.SphereGeometry(sphere_radius, 60, 40);
      geometry.scale(-1, 1, 1);

      material = new THREE.ShaderMaterial({
        uniforms: {
          texture1: { value: tex },
          texture2: { value: texOverlay },
          blendFactor: { value: 0.0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D texture1;
          uniform sampler2D texture2;
          uniform float blendFactor;
          varying vec2 vUv;
          void main() {
            vec4 color1 = texture2D(texture1, vUv);
            vec4 color2 = texture2D(texture2, vUv);
            gl_FragColor = color1 + color2*color2.a*blendFactor;
            gl_FragColor.a = 1.0;
          }
        `,
        transparent: true
      });

      mesh = new THREE.Mesh(geometry, material);
      mesh.rotateY(-Math.PI / 2);
      meshRef.current = mesh;
      scene.add(mesh);

      post = new MasterPostprocessing({ renderer, scene, camera, useFlames: true });
      post.gain = 1.0;
      post.afterimageGain = postFxConfig.afterimageDamp;
      post.warpGain = 1.0;
      post.flameGain = 1.0;
      post.speed = 10.0;

      handleResize = () => {
        if (!mount || !camera || !renderer || !post) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        post.resize(w, h);
      };
      window.addEventListener('resize', handleResize);

      const swayer = camera_swayer(camera);
      const start_pose = {
        yaw: -0.004999999999999995,
        pitch: 0.29499999999999993,
        x: 0,
        y: 0,
        z: 0
      };
      const end_pose = {
        yaw: -0.25499999999999995,
        pitch: 0.3900000000000002,
        x: 5.5,
        y: 0,
        z: -35
      };

      let prevTs = 0;
      const animate = (ts) => {
        if (cancelled) return;
        const dt = Math.max(0, (ts - prevTs) / 1000) || 0;
        prevTs = ts;

        if (activeRef.current) {
          const progSpeed = 0.8;
          progressRef.current += moveRef.current * progSpeed * dt;
          progressRef.current = Math.max(0, Math.min(1, progressRef.current));

          const progress = progRef.current?.progress ?? 0;
          setProgressState(progress);

          const poseInterp = interpolate([0.0, 0], [0.8, 1]);
          const gainInterp = interpolate([0.7, 0.0], [1.0, 1.0]);
          const lerp = (a, b, t) => a + (b - a) * t;
          const poseT = poseInterp(progress);
          const pose = {
            yaw: lerp(start_pose.yaw, end_pose.yaw, poseT),
            pitch: lerp(start_pose.pitch, end_pose.pitch, poseT),
            x: lerp(start_pose.x, end_pose.x, poseT),
            y: lerp(start_pose.y, end_pose.y, poseT),
            z: lerp(start_pose.z, end_pose.z, poseT)
          };
          body.rotation.y = pose.yaw;
          body.rotation.x = pose.pitch;
          body.position.x = pose.x;
          body.position.y = pose.y;
          body.position.z = pose.z;

          material.uniforms.blendFactor.value = progress;
          post.gain = gainInterp(progress);
          post.time = ts / 1000.0;

          swayer(ts);
          camera.position.z = Math.sin(post.time * Math.PI * 0.1 * 2) * 0.1 * post.gain;
          camera.position.x = Math.sin(post.time * Math.PI * 0.07 * 2) * 1.5 * post.gain;
          camera.position.y += Math.sin(post.time * Math.PI * 0.03 * 2) * 1.0 * post.gain;

          const frame = meterRef.current || {};
          const targetFov = computeInputReactiveFov(frame, {
            ...inputFovResponseConfig,
            baseFov: baseFovRef.current,
          });
          const dtFov = dt > 0 ? dt : (1 / 60);
          const smoothedFov = smoothToward(
            camera.fov,
            targetFov,
            dtFov,
            inputFovResponseConfig.smoothTauSec
          );
          if (Math.abs(camera.fov - smoothedFov) > 1e-5) {
            camera.fov = smoothedFov;
            camera.updateProjectionMatrix();
          }

          post.render();
        }

        rafRef.current = window.requestAnimationFrame(animate);
      };

      rafRef.current = window.requestAnimationFrame(animate);
      markVisualReady();
    })().catch(failAsync);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafRef.current);
      if (handleResize) window.removeEventListener('resize', handleResize);
      try { geometry?.dispose?.(); } catch {}
      try { material?.dispose?.(); } catch {}
      textures.forEach((tex) => { try { tex.dispose?.(); } catch {} });
      try { post?.dispose?.(); } catch {}
      try { renderer?.dispose?.(); } catch {}
      if (renderer?.domElement && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      visualReadyRef.current = false;
    };
  }, [onVisualReady]);

  const extras = (
    <div>
      <InstructionSectionTitle>The mountain answers</InstructionSectionTitle>
      <InstructionRow icon="clap">Clap your hands</InstructionRow>
      <InstructionRow icon="touch">Play the virtual drums</InstructionRow>
      <InstructionRow icon="microphone">Yell or sing to the microphone</InstructionRow>
    </div>
  );

  return (<>
      <InstructionPanel
          scene="Echoing Rock of Siliävuori"
          extras={extras}
          progress={progressState}
      >
      </InstructionPanel>
      <div ref={mountRef} style={{ position: 'fixed', width: '100%', height: '100%', margin: 0, padding: 0 }}></div>
      </>
    );
}
