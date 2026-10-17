import React, { useState } from 'react';
import { 
  User, 
  X, 
  AlertCircle, 
  KeyRound, 
  Sparkles,
  ArrowRight,
  Shield,
  Mail,
  UserPlus,
  LogIn
} from 'lucide-react';
import { authService } from '@/services/authService';
import { UserProfile } from '@/types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  initialMode?: 'login' | 'register';
}

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  onLoginSuccess,
  initialMode = 'login' 
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
    }
  }, [isOpen, initialMode]);
  
  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Register fields
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'login') {
      if (!username.trim() || !password) {
        setErrorMessage('Please enter both username and password.');
        return;
      }

      setIsLoading(true);
      try {
        const user = await authService.login(username.trim(), password);
        onLoginSuccess(user);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Login failed. Please verify credentials.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Register
      if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
        setErrorMessage('Username, email, and password are required.');
        return;
      }
      if (regUsername.trim().length < 3) {
        setErrorMessage('Username must be at least 3 characters.');
        return;
      }
      if (regPassword.length < 8) {
        setErrorMessage('Password must be at least 8 characters.');
        return;
      }

      setIsLoading(true);
      try {
        const user = await authService.register({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
          fullName: regFullName.trim() || undefined,
        });
        onLoginSuccess(user);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Registration failed. Please check inputs.');
      } finally {
        setIsLoading(false);
      }
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
              <p className="text-xs text-slate-400">
                {mode === 'login' ? 'Sign in to access your compliance workspace' : 'Create a new tenant account'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 border-b border-white/[0.08] bg-obsidian-950/40">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMessage(null); }}
            className={`py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              mode === 'login'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMessage(null); }}
            className={`py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              mode === 'register'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
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

          {mode === 'login' ? (
            <>
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

              {/* Quick Dev Credential Preset (only rendered in development environments) */}
              {!(import.meta as unknown as { env?: { PROD?: boolean } })?.env?.PROD && (
                <div className="p-3 rounded-xl bg-obsidian-950/60 border border-white/[0.08] flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Local Dev Account Preset</span>
                  <button
                    type="button"
                    onClick={fillDpoCredentials}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 group font-mono"
                  >
                    <span>Auto-fill Dev DPO</span>
                    <Sparkles className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">Full Name (Optional)</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. priya@acme.org"
                    className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. priya.sharma"
                    className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">Password (min 8 characters)</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-obsidian-850 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <span>{mode === 'login' ? 'Authenticating...' : 'Creating Account...'}</span>
            ) : mode === 'login' ? (
              <>
                <span>Sign In to Compliance Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Create Multi-Tenant Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

