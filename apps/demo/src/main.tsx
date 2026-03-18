import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from '@sabbour/adaptive-ui-core';

// Framework base styles
import '@sabbour/adaptive-ui-core/css/adaptive.css';

// ─── Register apps ───
// Import app modules — they self-register via registerApp()
import './SolutionArchitectApp';
import './TravelApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(AppRouter)
  )
);
