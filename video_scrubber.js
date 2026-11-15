const THREE = require('three');
const mediabunny = require('mediabunny');

// FrameScrubber: frame-accurate video scrubbing using mediabunny + WebCodecs
class FrameScrubber {
  /**
   * @param {object} opts
   * @param {string[]} opts.src - URLs of the video's consecutive parts
   */
  constructor({ src } = {}) {
    if (!src) throw new Error('FrameScrubber: src required');
    this.src = src;
    this._chunks = [];
    this._decoder = null;
    this._lastFrameIdx = -1;
    this._previousChunk = null;
    this._lastRenderTs = -1;
    this.texture = new THREE.VideoFrameTexture();
  }

  async load() {
    // Use mediabunny to demux and get VideoDecoder config + EncodedVideoChunk array
    let config;
    for (const src of this.src) {
      const input = new mediabunny.Input({
        source: new mediabunny.UrlSource(src),
        formats: mediabunny.ALL_FORMATS
      });

      const videoTrack = await input.getPrimaryVideoTrack();
      config = await videoTrack.getDecoderConfig();
      const reader = new mediabunny.EncodedPacketSink(videoTrack);

      for await (const packet of reader.packets()) {
        // Each part's timestamps start from zero; number the frames over the whole video.
        const chunk = packet.clone({ timestamp: this._chunks.length }).toEncodedVideoChunk();
        if(chunk.type != 'key') {
          throw new Error('FrameScrubber: non-keyframe encountered. Currently only keyframe-only videos are supported.');
        }
        this._chunks.push(chunk);
      }
    }

    this._decoder = new VideoDecoder({
      output: frame => {
        if (this._lastRenderTs == frame.timestamp) {
          frame.close();
          return;
        }
        this.texture.setFrame(frame);
        this._lastRenderTs = frame.timestamp;
        if(this._previousFrame) {
          this._previousFrame.close();
        }
        this._previousFrame = frame;
      },
      error: err => {
        console.error('FrameScrubber decoder error:', err);
      }
    });
    this._decoder.configure(config);
  }

  get frameCount() { return this._frameCount; }
  get isLoaded() { return this._isLoaded; }

  /**
   * Set normalized progress [0..1] -> frame index, decode and render
   */
  setProgress(p) {
    // TODO: We don't attempt to stay in sync (i.e. drop frames), so the progress will
    // actually process only as fast as the decoder decode. This does ensure smooth
    // playback, but the caller will easily get out of sync with the "true progress".
    if (!this._chunks.length) return;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
    const idx = Math.floor(clamped * Math.max(0, this._chunks.length - 1));
    //if (idx === this._lastFrameIdx) return;
    this._lastFrameIdx = idx;
    const chunk = this._chunks[idx];
    
    // TODO: This leaves duplicate frames in the decoder queue,
    // but it seems to work better than flushing. This does cause a slight
    // delay when starting the playback, as we have to wait for the queue to clear.
    // To get rid of the delay, we should probably "speculatively" decode or buffer
    // frames we expect to come next. But this works well enough for now for our case.
    if (this._lastRenderTs == chunk.timestamp) {
      return;
    }

    this._decoder.decode(chunk);
  }

  /**
   * Get normalized progress [0..1] based on last frame index
   */
  getProgress() {
    if (!this._frameCount) return 0;
    return Math.max(0, Math.min(1, this._lastFrameIdx / Math.max(1, this._frameCount - 1)));
  }

  dispose() {
    if (this._decoder) {
      try { this._decoder.close(); } catch (e) {}
      this._decoder = null;
    }
    this._chunks = [];
    this._lastFrameIdx = -1;
    if (this._videoTexture) {
      this.text.dispose();
      this.texture = null;
    }
  }
}

module.exports.FrameScrubber = FrameScrubber;
