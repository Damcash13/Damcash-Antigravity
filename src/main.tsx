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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AgeGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AgeGate>
    </AppErrorBoundary>
  </React.StrictMode>
);
