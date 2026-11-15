// Stand-in for Electron's ipcRenderer between the scene page and the instrument, which runs
// in an iframe over it as it ran in its own window in the exhibition.
const listeners = new Map();
let peer = window.parent === window ? null : window.parent;

window.addEventListener('message', (event) => {
  if (event.source !== peer || event.origin !== window.location.origin) return;
  const { channel, payload } = event.data;
  for (const listener of listeners.get(channel) || []) listener(event, payload);
});

module.exports.ipcRenderer = {
  connect(target) { peer = target; },
  send(channel, payload) { peer?.postMessage({ channel, payload }, window.location.origin); },
  on(channel, listener) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(listener);
  },
  removeListener(channel, listener) { listeners.get(channel)?.delete(listener); },
};
