import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Save, 
  ShieldCheck, 
  Server, 
  Check, 
  AlertCircle, 
  Mail, 
  Bell, 
  Globe, 
  Cpu, 
  RefreshCw,
  Sparkles,
  Lock,
  Building2,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/services/api';
import { UserSettings } from '@/types';
import { DEFAULT_USER_SETTINGS } from '@/data/mockData';
import { 
  validateApiUrl, 
  getApiBaseUrl, 
  getDefaultApiUrl 
} from '@/services/apiConfig';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<{
    tested: boolean;
    ok: boolean;
    message: string;
    latencyMs?: number;
  }>({
    tested: false,
    ok: false,
    message: '',
  });

  useEffect(() => {
    async function load() {
      const data = await api.getSettings();
      setSettings(data);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = validateApiUrl(settings.apiUrl);
    if (!val.valid) {
      setUrlError(val.error || 'Invalid API URL format');
      toast.error(val.error || 'Invalid API URL format');
      return;
    }
    setUrlError(null);
    const normalizedSettings = {
      ...settings,
      apiUrl: val.normalizedUrl || settings.apiUrl,
    };
    setSettings(normalizedSettings);
    await api.saveSettings(normalizedSettings);
    setIsSaved(true);
    toast.success('Settings synchronized successfully');
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleResetDefaults = async () => {
    setSettings(DEFAULT_USER_SETTINGS);
    await api.saveSettings(DEFAULT_USER_SETTINGS);
    setIsSaved(true);
    toast.info('Settings reset to system defaults');
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleTestBackend = async () => {
    const val = validateApiUrl(settings.apiUrl);
    if (!val.valid) {
      setUrlError(val.error || 'Invalid API URL format');
      setBackendStatus({
        tested: true,
        ok: false,
        message: val.error || 'Invalid API URL',
      });
      return;
    }
    setUrlError(null);
    setIsTestingBackend(true);
    const res = await api.testBackendConnection(settings.apiUrl);
    setIsTestingBackend(false);
    setBackendStatus({
      tested: true,
      ok: res.ok,
      message: res.message,
      latencyMs: res.latencyMs,
    });
    if (res.ok) {
      toast.success(`Gateway ping successful (${res.latencyMs || 0}ms latency)`);
    } else {
      toast.error(`Connection failed: ${res.message}`);
    }
    if (res.normalizedUrl && res.normalizedUrl !== settings.apiUrl) {
      setSettings((prev) => ({ ...prev, apiUrl: res.normalizedUrl! }));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle">
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F]">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] font-sans">
              Platform Settings & Connectivity
            </h2>
            <p className="text-xs sm:text-sm text-[#71717A] mt-0.5">
              Configure Data Protection Officer (DPO) records, statutory audit rulesets, and FastAPI backend integration.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: DPO & Fiduciary Profile */}
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2 border-b border-[#E4E4E7] pb-3 font-sans">
            <Lock className="w-4 h-4 text-[#52796F]" />
            <span>Data Fiduciary & DPO Designation (DPDP Act §8)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Organization / Legal Entity</label>
              <input
                type="text"
                value={settings.organizationName}
                onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#18181B] focus:outline-none focus:border-[#52796F] font-medium"
              />
            </div>

            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Statutory Jurisdiction</label>
              <input
                type="text"
                disabled
                value={settings.jurisdiction}
                className="w-full bg-[#F8FAFC]/50 border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#71717A] cursor-not-allowed opacity-80 font-mono"
              />
            </div>

            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Designated DPO Name</label>
              <input
                type="text"
                value={settings.dpoName}
                onChange={(e) => setSettings({ ...settings, dpoName: e.target.value })}
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#18181B] focus:outline-none focus:border-[#52796F] font-medium"
              />
            </div>

            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">DPO Official Redressal Email</label>
              <input
                type="email"
                value={settings.dpoEmail}
                onChange={(e) => setSettings({ ...settings, dpoEmail: e.target.value })}
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#18181B] focus:outline-none focus:border-[#52796F] font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Backend Connectivity & Demo Mode */}
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2 font-sans">
              <Server className="w-4 h-4 text-[#52796F]" />
              <span>FastAPI Backend Engine Connection</span>
            </h3>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#71717A] font-medium font-mono">Demo Mode:</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, demoMode: !settings.demoMode })}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                  settings.demoMode ? 'bg-[#14B8A6]' : 'bg-[#F1F5F9]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    settings.demoMode ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <p className="text-xs text-[#71717A] leading-relaxed font-sans">
            PrivaCraft includes an isolated typed API layer connecting to the FastAPI service. Configured settings immediately override the default Vite environment URL without requiring an application rebuild or reload.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[11px] font-mono">
            <span className="text-[#71717A]">
              Default Fallback: <strong className="text-[#18181B]">{getDefaultApiUrl()}</strong>
            </span>
            <span className="text-[#71717A]">
              Active Resolved URL: <strong className="text-[#52796F]">{getApiBaseUrl()}</strong>
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#18181B] mb-1.5 font-sans">
                API Base URL Endpoint
              </label>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={settings.apiUrl}
                  onChange={(e) => {
                    setSettings({ ...settings, apiUrl: e.target.value });
                    if (urlError) setUrlError(null);
                  }}
                  placeholder="http://127.0.0.1:8000"
                  className={`flex-1 bg-[#F8FAFC] border rounded-xl px-3.5 py-2.5 text-xs font-mono text-[#18181B] focus:outline-none ${
                    urlError ? 'border-[#EF4444]/60 focus:border-[#EF4444]' : 'border-[#E4E4E7] focus:border-[#52796F]'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleTestBackend}
                  disabled={isTestingBackend}
                  className="px-4 py-2.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingBackend ? 'animate-spin' : ''}`} />
                  <span>{isTestingBackend ? 'Pinging...' : 'Test Connection'}</span>
                </button>
              </div>
              {urlError && (
                <p className="text-xs text-[#B91C1C] flex items-center gap-1.5 font-medium mt-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{urlError}</span>
                </p>
              )}
            </div>

            {backendStatus.tested && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  backendStatus.ok
                    ? 'bg-green-50 border-green-200 text-[#15803D]'
                    : 'bg-amber-50 border-amber-200 text-[#B45309]'
                }`}
              >
                {backendStatus.ok ? (
                  <Check className="w-4 h-4 text-[#15803D] flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#B45309] flex-shrink-0" />
                )}
                <div className="flex-1">
                  <span className="font-medium">{backendStatus.message}</span>
                  {backendStatus.latencyMs ? (
                    <span className="font-mono ml-2 text-[11px] font-bold text-[#52796F]">({backendStatus.latencyMs}ms latency)</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Scan Engine Preferences */}
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2 border-b border-[#E4E4E7] pb-3 font-sans">
            <Cpu className="w-4 h-4 text-[#52796F]" />
            <span>Audit Engine & Regulatory Ruleset</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Compliance Ruleset Version</label>
              <input
                type="text"
                disabled
                value={settings.rulesetVersion}
                className="w-full bg-[#F8FAFC]/50 border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#71717A] font-mono opacity-80"
              />
            </div>

            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Scan Rate Limiting Mode</label>
              <select
                value={settings.scanRateLimit}
                onChange={(e) => setSettings({ ...settings, scanRateLimit: e.target.value as any })}
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-xs font-medium text-[#18181B] focus:outline-none focus:border-[#52796F] cursor-pointer"
              >
                <option value="conservative">Conservative (Low footprint - 2 req/s)</option>
                <option value="standard">Standard (Safe crawling - 5 req/s)</option>
                <option value="aggressive">Aggressive (Deep audit sandbox - 12 req/s)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Notification Alerts */}
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2 border-b border-[#E4E4E7] pb-3 font-sans">
            <Bell className="w-4 h-4 text-[#52796F]" />
            <span>Incident & Breach Alert Channels</span>
          </h3>

          <div className="space-y-3 text-xs font-sans">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.notifyOnCritical}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, notifyOnCritical: e.target.checked },
                  })
                }
                className="rounded bg-[#F8FAFC] border-[#E4E4E7] text-[#52796F] focus:ring-0"
              />
              <span className="text-[#18181B] font-semibold">
                Immediately notify on Section 8 Critical Exposures (Aadhaar / PII leakage)
              </span>
            </label>

            <div>
              <label className="block text-[#71717A] mb-1.5 font-semibold">Slack / Discord Webhook URL</label>
              <input
                type="text"
                value={settings.notifications.webhookUrl}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, webhookUrl: e.target.value },
                  })
                }
                placeholder="https://hooks.slack.com/services/..."
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-[#18181B] font-mono focus:outline-none focus:border-[#52796F]"
              />
            </div>
          </div>
        </div>

        {/* Save button & Reset */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {isSaved && (
            <span className="text-xs text-[#15803D] flex items-center gap-1.5 font-semibold animate-in fade-in">
              <Check className="w-4 h-4" />
              <span>Settings synchronized successfully</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] font-semibold text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#52796F]" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs shadow-subtle transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
};
