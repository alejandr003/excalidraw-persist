import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.scss';
import ToastProvider, { useToast } from './contexts/ToastProvider';
import { initializeLogger } from './utils/logger';

const AppWithToasts = () => {
  const { showToast } = useToast();

  React.useEffect(() => {
    initializeLogger(showToast);
  }, [showToast]);

  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppWithToasts />
    </ToastProvider>
  </React.StrictMode>
);
