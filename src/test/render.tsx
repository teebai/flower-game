import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import React from 'react';
import { AuthProvider } from '../auth/AuthProvider';

interface ProvidersProps {
  children: React.ReactNode;
}

function AllProviders({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}

function render(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { render };
