const React = require('react');
const { createRoot } = require('react-dom/client');
const SceneApp = require('./AppScene.jsx');

createRoot(document.getElementById('root')).render(React.createElement(SceneApp));
