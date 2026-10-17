import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Shell } from '@/components/layout/Shell';
import { Overview } from '@/pages/Overview';
import { Scan } from '@/pages/Scan';
import { Findings } from '@/pages/Findings';
import { PrivacyFlow } from '@/pages/PrivacyFlow';
import { FixVerify } from '@/pages/FixVerify';
import { Copilot } from '@/pages/Copilot';
import { History } from '@/pages/History';
import { Settings } from '@/pages/Settings';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Toaster 
        theme="dark" 
        position="top-right" 
        richColors 
        toastOptions={{
          className: 'bg-obsidian-900 border border-white/10 text-slate-100 shadow-2xl rounded-xl text-xs',
        }}
      />
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Overview />} />
          <Route path="/overview" element={<Navigate to="/" replace />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/findings" element={<Findings />} />
          <Route path="/privacy-flow" element={<PrivacyFlow />} />
          <Route path="/fix-verify" element={<FixVerify />} />
          <Route path="/copilot" element={<Copilot />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

