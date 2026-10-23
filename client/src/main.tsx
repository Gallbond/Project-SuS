import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { SettingsProvider } from './lib/settings';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root в index.html');

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SettingsProvider>
  </StrictMode>,
);
