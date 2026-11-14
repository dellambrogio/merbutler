import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';
import { getSettings } from './core/settings';
import { applyTheme } from './settings/theme';

// Before the first render, so a forced theme does not flash the other one.
applyTheme(getSettings().theme);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
