const THREE = require('three');

const WarpShader = {
  uniforms: {
    tDiffuse:   { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time:       { value: 0 },
    gain:       { value: 10.0 },
    speed:      { value: 10.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2  resolution;
    uniform float time;
    uniform float gain;
    uniform float speed;
    varying vec2 vUv;
    #define TAU 6.28318530718
    float hash11(float p) {
      p = fract(p*0.1031);
      p *= p + 33.33;
      return fract(1e4*sin(p+19.19)*p);
    }
    float n2(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      float a = hash11(dot(i, vec2(1.0,57.0)));
      float b = hash11(dot(i+vec2(1.0,0.0), vec2(1.0,57.0)));
      float c = hash11(dot(i+vec2(0.0,1.0), vec2(1.0,57.0)));
      float d = hash11(dot(i+vec2(1.0,1.0), vec2(1.0,57.0)));
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.5;
      mat2 R = mat2(0.8,-0.6, 0.6,0.8);
      for (int i=0;i<4;i++){
        v += a*n2(p);
        p = R*p*2.0;
        a *= 0.5;
      }
      return v;
    }
    vec2 wanderCenter(float t, float seed) {
      vec2 off = vec2(
        fbm(vec2(seed*3.17, t*0.015*speed)),
        fbm(vec2(seed*7.11, t*0.019*speed))
      );
      vec2 A = vec2(0.05, 0.04);
      return 0.5 + (off-0.5)*2.0*A;
    }
    float wanderFreq(float baseFreq, float depth, float t, float seed) {
      float n = fbm(vec2(seed*5.31, t*0.12*speed));
      float k = 1.0 + depth*0.1 * ((n-0.5)*2.0);
      return baseFreq * k;
    }
    vec2 radialSineWarp(vec2 uv, vec2 centerUV, float aspect, float t,
                        float freq, float ampPx, float phase)
    {
      vec2 dp  = uv - centerUV;
      vec2 pA  = vec2(dp.x * aspect, dp.y);
      float r  = length(pA) + 1e-6;
      vec2 dirA = pA / r;
      float amp = ampPx / max(resolution.y, 1.0);
      float w = sin(TAU * (r * freq) + phase - t) * amp;
      vec2 dirUV = vec2(dirA.x / aspect, dirA.y);
      return dirUV * w;
    }
    void main() {
      vec2 R = resolution;
      float aspect = R.x / max(R.y, 1.0);
      vec2 uv = vUv;
      float t = time * speed;
      vec2 cR = wanderCenter(t,  3.0);
      vec2 cG = wanderCenter(t, 11.0);
      vec2 cB = wanderCenter(t, 23.0);
      float fR = wanderFreq(6.0, 0.28, t,  3.0);
      float fG = wanderFreq(4.7, 0.24, t, 11.0);
      float fB = wanderFreq(3.4, 0.22, t, 23.0);
      vec2 dR = radialSineWarp(uv, cR, aspect, t, fR, 10.0, 0.20);
      vec2 dG = radialSineWarp(uv, cG, aspect, t, fG,  8.0, 1.15);
      vec2 dB = radialSineWarp(uv, cB, aspect, t, fB, 12.0, 2.05);
      vec2 uvR = uv + dR * gain;
      vec2 uvG = uv + dG * gain;
      vec2 uvB = uv + dB * gain;
      vec4 sR = texture2D(tDiffuse, uvR);
      vec4 sG = texture2D(tDiffuse, uvG);
      vec4 sB = texture2D(tDiffuse, uvB);
      gl_FragColor = vec4(sR.r, sG.g, sB.b, 1.0);
    }
  `
};

module.exports = { WarpShader };
