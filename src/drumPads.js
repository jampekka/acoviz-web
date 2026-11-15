// The virtual instrument's drum pads in each scene.
const DRUM_PADS_DEFAULT = [
  { midiNote: 36, label: 'Bass' },
  { midiNote: 48, label: 'Tom' },
];
const DRUM_PADS_HIID = [
  { midiNote: 48, label: 'Drum' },
];

module.exports = function drumPads(sceneName) {
  return sceneName === 'Hiidenkirnukivi' ? DRUM_PADS_HIID : DRUM_PADS_DEFAULT;
};
