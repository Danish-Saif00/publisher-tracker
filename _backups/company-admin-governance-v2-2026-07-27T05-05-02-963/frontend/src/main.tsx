import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

import { queryClient } from './app/query-client';
import { AuthProvider } from './features/auth/auth-provider';
import { CompanyProvider } from './features/companies/company-provider';
import App from './App';
import './index.css';
import './control-plane.css';
import './major-overhaul.css';
import './batch1-ui-foundation.css';
import './batch2-core-catalog.css';
import './batch3-final-operations.css';
import './super-admin-governance.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('React root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <App />
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
