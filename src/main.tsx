import { Component, type ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200">
            <h1 className="mb-2 text-lg font-bold text-slate-800">حدث خطأ في التطبيق</h1>
            <p className="mb-4 text-sm text-slate-500">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
