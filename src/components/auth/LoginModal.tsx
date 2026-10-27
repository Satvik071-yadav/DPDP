import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, 
  X, 
  AlertCircle, 
  KeyRound, 
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

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
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

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Security Access"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/40 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md my-auto bg-[#FFFFFF] border border-[#E4E4E7] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Modal Header */}
        <div className="p-6 border-b border-[#E4E4E7] bg-[#FFFFFF] flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#18181B] tracking-tight">PrivaCraft Security Access</h3>
              <p className="text-xs text-[#71717A]">
                {mode === 'login' ? 'Sign in to access your PrivaCraft compliance workspace' : 'Create a new tenant account'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 border-b border-[#E4E4E7] bg-[#FFFFFF] flex-shrink-0">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMessage(null); }}
            className={`py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              mode === 'login'
                ? 'border-[#52796F] text-[#52796F] bg-[#52796F]/10'
                : 'border-transparent text-[#71717A] hover:text-[#18181B]'
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
                ? 'border-[#52796F] text-[#52796F] bg-[#52796F]/10'
                : 'border-transparent text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === 'login' ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Username or Email</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. priya.sharma or dpo@org.in"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Full Name (Optional)</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. priya@acme.org"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. priya.sharma"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[#18181B] font-semibold">Password (min 8 characters)</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-2.5 text-[#18181B] placeholder:text-[#71717A] focus:outline-none focus:border-[#52796F] transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
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

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

