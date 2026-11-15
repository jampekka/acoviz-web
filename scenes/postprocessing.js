const THREE = require('three');
const { EffectComposer } = require('three/examples/jsm/postprocessing/EffectComposer.js');
const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');
const { ShaderPass } = require('three/examples/jsm/postprocessing/ShaderPass.js');
const { UnrealBloomPass } = require('three/examples/jsm/postprocessing/UnrealBloomPass.js');
const { WarpShader, FlameFeedbackPass } = require('./effects.js');
const { AfterimagePass } = require('three/examples/jsm/postprocessing/AfterimagePass.js');


class MasterPostprocessing {
  constructor({ renderer, scene, camera, useFlames = false, flameOptions = {} }) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const screenSize = new THREE.Vector2(renderer.domElement.width, renderer.domElement.height);

    //this.bloomPass = new UnrealBloomPass(screenSize, 1.5, 0.4, 0.85);
    //this.bloomPass.threshold = 0.8;
    //this.bloomPass.strength = 1.0;
    //this.bloomPass.radius = 0.0;
    //this.composer.addPass(this.bloomPass);

    this.afterimagePass = new AfterimagePass();
    this.afterimagePass.uniforms['damp'].value = 0.0;
    this.composer.addPass(this.afterimagePass);

    this.warpPass = new ShaderPass(WarpShader);
    this.warpPass.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    //this.composer.addPass(this.warpPass);

    this.flamePass = null;
    if (useFlames) {
      this.flamePass = new FlameFeedbackPass(flameOptions);
      this.composer.addPass(this.flamePass);
    }

    this._gain = 1.0;
    this._warpGain = 0.0;
    this._flameGain = 0.0;
    this._time = 0;
    this._speed = 10.0;
    this._afterimageGain = 0.0;
    this._disposed = false;
  }

  set gain(v) {
    this._gain = v;
    
    this.afterimagePass.uniforms['damp'].value = this._afterimageGain*v;
    this.warpPass.uniforms.gain.value = this._warpGain * v;
    if (this.flamePass) this.flamePass.gain = this._flameGain * v;
  }
  get gain() { return this._gain; }

  set afterimageGain(v) {
    this._afterimageGain = v;
  }

  get afterimageGain() { 
    return this._afterimageGain;
  }

  set warpGain(v) {
    this._warpGain = v;
    this.warpPass.uniforms.gain.value = v * this._gain;
  }
  get warpGain() { return this._warpGain; }

  set flameGain(v) {
    this._flameGain = v;
    if (this.flamePass) this.flamePass.gain = v * this._gain;
  }
  get flameGain() { return this._flameGain; }

  set time(t) {
    this._time = t;
    this.warpPass.uniforms.time.value = t;
    if (this.flamePass) this.flamePass.feedbackMat.uniforms.time.value = t;
  }
  get time() { return this._time; }

  set speed(s) {
    this._speed = s;
    this.warpPass.uniforms.speed.value = s;
  }
  get speed() { return this._speed; }

  resize(w, h) {
    this.composer.setSize(w, h);
    this.warpPass.uniforms.resolution.value.set(w, h);
    if (this.flamePass) this.flamePass.setSize(w, h);
  }

  render() {
    if (this._disposed) return;
    this.composer.render();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    try { this.flamePass?.dispose?.(); } catch {}
    try { this.warpPass?.dispose?.(); } catch {}
    try { this.afterimagePass?.dispose?.(); } catch {}
    try { this.composer?.dispose?.(); } catch {}
    this.flamePass = null;
    this.warpPass = null;
    this.afterimagePass = null;
    this.composer = null;
  }
}

module.exports = { MasterPostprocessing };
