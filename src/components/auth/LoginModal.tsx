import React, { useState } from 'react';
import { 
  Lock, 
  User, 
  X, 
  ShieldCheck, 
  AlertCircle, 
  Check, 
  KeyRound, 
  Sparkles,
  ArrowRight,
  Shield
} from 'lucide-react';
import { authService } from '@/services/authService';
import { UserProfile } from '@/types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('aditi.deshmukh');
  const [password, setPassword] = useState('dpdp_guard_demo_2026');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const user = await authService.login(username.trim(), password);
      onLoginSuccess(user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDpoCredentials = () => {
    setUsername('aditi.deshmukh');
    setPassword('dpdp_guard_demo_2026');
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="relative z-10 w-full max-w-md bg-obsidian-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/[0.08] bg-obsidian-950/70 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-cyan-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">DPDP-Guard Security Access</h3>
              <p className="text-xs text-slate-400">Authenticate as Data Protection Officer or Auditor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Username or Email</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. aditi.deshmukh"
                className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold">Password</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Quick Demo Credential Preset */}
          <div className="p-3 rounded-xl bg-obsidian-950/60 border border-white/[0.08] flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Demo DPO Account Available</span>
            <button
              type="button"
              onClick={fillDpoCredentials}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 group font-mono"
            >
              <span>Auto-fill DPO</span>
              <Sparkles className="w-3 h-3 group-hover:rotate-12 transition-transform" />
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Compliance Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

