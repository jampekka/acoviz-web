const React = require('react');
const { createRoot } = require('react-dom/client');
const InstrumentApp = require('./InstrumentApp.jsx');

createRoot(document.getElementById('root')).render(React.createElement(InstrumentApp));
