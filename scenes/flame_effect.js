const THREE = require('three');
const { Pass, FullScreenQuad } = require('three/examples/jsm/postprocessing/Pass.js');

const quadVS = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const feedbackFS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D source;
  uniform sampler2D prev;
  uniform vec2  resolution;
  uniform float time;
  uniform float decay;
  uniform float zoom;
  uniform float inject;
  uniform float drift;
  uniform float wobble;
  uniform float edge_low;
  uniform float edge_high;
  uniform float flame_gain;
  uniform float flame_gamma;
  uniform float sat_boost;
  uniform vec3  zoom_rgb;
  uniform vec3  seed_rgb;
  uniform float first_frame;
  float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
  vec2 toP(vec2 uv, vec2 R){ vec2 fc = uv*R; return (fc - 0.5*R) / R.y; }
  vec2 toUV(vec2 p, vec2 R){ vec2 uv = p; uv.x *= R.y/R.x; return uv + 0.5; }
  vec2 wrapUV(vec2 uv){ return fract(uv); }
  vec3 sat(vec3 c, float k){ float Y = luma(c); return mix(vec3(Y), c, k); }
  vec3 sobelEdgeRGB(sampler2D tex, vec2 uv, vec2 R){
    vec2 px = 1.0 / R;
    vec3 tl = texture2D(tex, uv + px*vec2(-1.,  1.)).rgb;
    vec3 tc = texture2D(tex, uv + px*vec2( 0.,  1.)).rgb;
    vec3 tr = texture2D(tex, uv + px*vec2( 1.,  1.)).rgb;
    vec3 ml = texture2D(tex, uv + px*vec2(-1.,  0.)).rgb;
    vec3 mc = texture2D(tex, uv + px*vec2( 0.,  0.)).rgb;
    vec3 mr = texture2D(tex, uv + px*vec2( 1.,  0.)).rgb;
    vec3 bl = texture2D(tex, uv + px*vec2(-1., -1.)).rgb;
    vec3 bc = texture2D(tex, uv + px*vec2( 0., -1.)).rgb;
    vec3 br = texture2D(tex, uv + px*vec2( 1., -1.)).rgb;
    vec3 Gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    vec3 Gy =  tl + 2.0*tc + tr - bl - 2.0*bc - br;
    vec3 g = sqrt(Gx*Gx + Gy*Gy);
    g = smoothstep(edge_low, edge_high, g);
    g = pow(clamp(g, 0.0, 1.0), vec3(flame_gamma));
    return g;
  }
  vec2 zoomTransformSeed(vec2 p, vec2 R, float t, float zoomAmt, float seed){
    vec2 centerUV = 0.5 + wobble * vec2(
      sin(0.63*t + seed*1.11),
      cos(0.81*t + seed*1.73)
    );
    vec2 centerP  = (centerUV - 0.5) * vec2(R.x/R.y, 1.0);
    vec2 q = p - centerP;
    q *= (1.0 - zoomAmt);
    q += centerP + drift * vec2(sin(0.7*t + seed*0.3), cos(1.1*t + seed*0.5));
    return q;
  }
  void main(){
    vec2 R = resolution;
    float t = time;
    vec3 srcCol = sat(texture2D(source, vUv).rgb, sat_boost);
    vec3 e = sobelEdgeRGB(source, vUv, R);
    vec2 p = toP(vUv, R);
    vec2 pPrevR = zoomTransformSeed(p, R, t, zoom * zoom_rgb.r, seed_rgb.r);
    vec2 pPrevG = zoomTransformSeed(p, R, t, zoom * zoom_rgb.g, seed_rgb.g);
    vec2 pPrevB = zoomTransformSeed(p, R, t, zoom * zoom_rgb.b, seed_rgb.b);
    float prevR = texture2D(prev, wrapUV(toUV(pPrevR, R))).r;
    float prevG = texture2D(prev, wrapUV(toUV(pPrevG, R))).g;
    float prevB = texture2D(prev, wrapUV(toUV(pPrevB, R))).b;
    prevR *= (1.0 - first_frame);
    prevG *= (1.0 - first_frame);
    prevB *= (1.0 - first_frame);
    float injR = srcCol.r * e.r * flame_gain;
    float injG = srcCol.g * e.g * flame_gain;
    float injB = srcCol.b * e.b * flame_gain;
    float flameR = prevR * decay + injR * inject;
    float flameG = prevG * decay + injG * inject;
    float flameB = prevB * decay + injB * inject;
    gl_FragColor = vec4(flameR, flameG, flameB, 1.0);
  }
`;

const compositeFS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D baseTex;
  uniform sampler2D flamesTex;
  uniform float gain;
  uniform float flame_view_gamma;
  uniform float flame_clamp;

  void main(){
    vec3 src    = texture2D(baseTex,   vUv).rgb;
    vec3 flames = texture2D(flamesTex, vUv).rgb;
    flames = pow(clamp(flames, 0.0, 1.0), vec3(flame_view_gamma));
    vec3 outCol = src + flames * gain*0.5;
    outCol = clamp(outCol, 0.0, flame_clamp);
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

class FlameFeedbackPass extends Pass {
  constructor({
    source = null,
    decay = 0.99,
    zoom = 0.01,
    inject = 0.10,
    drift = 0.003,
    wobble = 0.015,
    edge_low = 0.12,
    edge_high = 0.35,
    flame_gain = 2.0,
    flame_gamma = 0.85,
    sat_boost = 1.0,
    zoom_rgb = new THREE.Vector3(1.0, 1.02, 1.04),
    seed_rgb = new THREE.Vector3(0.0, 3.7, 7.9),
    gain = 1.0,
    flame_view_gamma = 1.0,
    flame_clamp = 1.0,
  } = {}) {
    super();
    this.sourceTexture = source;
    this._time = 0;
    this._firstFrame = true;
    this.rtA = null;
    this.rtB = null;
    this.feedbackMat = new THREE.ShaderMaterial({
      uniforms: {
        source: { value: this.sourceTexture },
        prev:   { value: null },
        resolution: { value: new THREE.Vector2(1,1) },
        time: { value: 0 },
        decay:     { value: decay },
        zoom:      { value: zoom },
        inject:    { value: inject },
        drift:     { value: drift },
        wobble:    { value: wobble },
        edge_low:    { value: edge_low },
        edge_high:   { value: edge_high },
        flame_gain:  { value: flame_gain },
        flame_gamma: { value: flame_gamma },
        sat_boost:   { value: sat_boost },
        zoom_rgb: { value: zoom_rgb },
        seed_rgb: { value: seed_rgb },
        first_frame: { value: 1.0 },
      },
      vertexShader: quadVS,
      fragmentShader: feedbackFS,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        baseTex:   { value: null },
        flamesTex: { value: null },
        gain: { value: gain },
        flame_view_gamma: { value: flame_view_gamma },
        flame_clamp: { value: flame_clamp },
      },
      vertexShader: quadVS,
      fragmentShader: compositeFS,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.fsQuad = new FullScreenQuad(this.compositeMat);
    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;
  }
  setSize(w, h) {
    const params = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtA = new THREE.WebGLRenderTarget(w, h, params);
    this.rtB = new THREE.WebGLRenderTarget(w, h, params);
    this.feedbackMat.uniforms.resolution.value.set(w, h);
  }
  set gain(v){ this.compositeMat.uniforms.gain.value = v; }
  get gain(){ return this.compositeMat.uniforms.gain.value; }
  set source(tex){ this.sourceTexture = tex; this.feedbackMat.uniforms.source.value = tex; }
  dispose(){
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.fsQuad.dispose();
    this.feedbackMat.dispose();
    this.compositeMat.dispose();
  }
  render(renderer, writeBuffer, readBuffer, deltaTime){
    if (!this.rtA || !this.rtB) this.setSize(readBuffer.width, readBuffer.height);
    this._time += (deltaTime || 0);
    const fbU = this.feedbackMat.uniforms;
    fbU.time.value = this._time;
    const liveSource = this.sourceTexture || readBuffer.texture;
    fbU.source.value = liveSource;
    let ping = this.rtA, pong = this.rtB;
    this.feedbackMat.uniforms.prev.value = ping.texture;
    this.feedbackMat.uniforms.first_frame.value = this._firstFrame ? 1.0 : 0.0;
    renderer.setRenderTarget(pong);
    renderer.clear();
    const savedMat = this.fsQuad.material;
    this.fsQuad.material = this.feedbackMat;
    this.fsQuad.render(renderer);
    this.fsQuad.material = savedMat;
    const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp;
    ping = this.rtA;
    this.compositeMat.uniforms.baseTex.value   = readBuffer.texture;
    this.compositeMat.uniforms.flamesTex.value = ping.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
    this._firstFrame = false;
  }
}

module.exports = { FlameFeedbackPass };
