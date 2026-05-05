import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { AgeGate } from './components/common/AgeGate';
import './i18n/config';
import './styles/globals.css';

// Set initial universe class
document.body.className = 'chess-universe';

// ── Handle stale Vite chunks after redeployment ─────────────────────────────
// When a new build deploys, old chunk filenames (content-hashed) disappear.
// Cached pages still reference them → dynamic import fails. Auto-reload once.
window.addEventListener('vite:preloadError', () => {
  const reloaded = sessionStorage.getItem('dc_chunk_reload');
  if (!reloaded) {
    sessionStorage.setItem('dc_chunk_reload', '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AgeGate>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </AgeGate>
    </AppErrorBoundary>
  </React.StrictMode>
);
