import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider, ThemeProvider, ToastProvider } from '@reporter/ui';
import { App } from './App.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
