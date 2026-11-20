import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { browserLanguage } from './messages';
import './styles.css';

const language = browserLanguage();
document.documentElement.lang = language;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App language={language} />
  </StrictMode>,
);
