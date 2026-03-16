import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './framework/app-router';

// Framework base styles
import './framework/css/adaptive.css';

// ─── Register apps ───
// Import app modules — they self-register via registerApp()
import './demo/BasicApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(AppRouter)
  )
);
