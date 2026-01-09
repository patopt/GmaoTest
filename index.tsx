import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { logger } from './utils/logger';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Impossible de trouver l'élément root");
} else {
  logger.info("Démarrage du moteur React...");
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}