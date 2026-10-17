import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { 
  Search, 
  Bell, 
  Plus, 
  Menu, 
  ExternalLink, 
  ShieldAlert, 
  Check, 
  User, 
  Sliders, 
  Info,
  X,
  ChevronRight,
  ShieldCheck,
  Building2,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import { authService } from '@/services/authService';
import { LoginModal } from '@/components/auth/LoginModal';
import { NotificationItem, UserProfile } from '@/types';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
}

const pageTitles: Record<string, { title: string; category: string; subtitle: string }> = {
  '/': { title: 'Privacy Command Center', category: 'Executive View', subtitle: 'Continuous DPDP Compliance & Exposure Auditing' },
  '/scan': { title: 'Target Website Scanner', category: 'Investigation', subtitle: 'Deep Probe, Endpoints & Authorization Analysis' },
  '/findings': { title: 'Forensic Findings Explorer', category: 'Audit Results', subtitle: 'Identified Data Exposures, Trackers & Non-Compliance' },
  '/privacy-flow': { title: 'Privacy Flow Topology', category: 'Visualization', subtitle: 'Interactive Data Flow & Consent State Graph' },
  '/fix-verify': { title: 'Fix & Verify Workbench', category: 'Remediation', subtitle: 'Interactive Code Patches & Sandbox Verification' },
  '/copilot': { title: 'DPDP Copilot Investigator', category: 'Forensic AI', subtitle: 'Evidence-Grounded Privacy Compliance Reasoning' },
  '/history': { title: 'Audit History & Archives', category: 'Compliance Records', subtitle: 'Audit Records, Evidence Archives & Reports' },
  '/settings': { title: 'Platform Settings & Engine', category: 'Configuration', subtitle: 'DPO Records, Audit Profiles & FastAPI Gateway' },
};

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onOpenCommandPalette }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(2);
  const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'critical'>('all');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentPath = location.pathname;
  const pageInfo = pageTitles[currentPath] || { title: 'DPDP-Guard', category: 'Platform', subtitle: 'Privacy Intelligence' };

  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  // Load live notifications and verify user session and backend connection
  useEffect(() => {
    async function loadHeaderData() {
      // Check backend health
      try {
        const health = await api.checkHealth();
        setIsBackendHealthy(health.status === 'healthy' || health.status === 'ok');
      } catch {
        setIsBackendHealthy(false);
      }

      const notifs = await api.getNotifications().catch(() => []);
      setNotifications(notifs);

      const user = await authService.fetchCurrentUser().catch(() => null);
      if (user) setCurrentUser(user);
    }
    loadHeaderData();
    const interval = setInterval(loadHeaderData, 25000);
    return () => clearInterval(interval);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredActivities = activeNotificationTab === 'critical'
    ? notifications.filter((a) => a.severity === 'critical')
    : notifications;

  const userInitials = (currentUser?.fullName || 'User')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(authService.getCurrentUser());
    setShowProfileMenu(false);
  };

  return (
    <header className="h-16 bg-obsidian-950/80 backdrop-blur-xl border-b border-white/[0.08] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-20 shadow-md">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
          title="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium truncate">
            <span className="text-slate-500 hidden sm:inline">DPDP-Guard</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
            <span className="text-slate-400 hidden sm:inline">{pageInfo.category}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
            <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
              {pageInfo.title}
            </h1>
          </div>
          <span className="hidden md:inline-block text-[11px] text-slate-400 font-normal truncate mt-0.5">
            {pageInfo.subtitle}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Live Backend Connection Indicator */}
        <div 
          title={isBackendHealthy ? "FastAPI Gateway Online & Synchronized" : "Backend Gateway Offline or Disconnected"}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-obsidian-900 border border-white/[0.08] text-[11px] font-mono"
        >
          <span className={cn(
            "w-2 h-2 rounded-full",
            isBackendHealthy === true ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse" :
            isBackendHealthy === false ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" :
            "bg-amber-400 animate-pulse"
          )} />
          <span className="text-slate-300">
            {isBackendHealthy === true ? "Gateway: Live" :
             isBackendHealthy === false ? "Gateway: Offline" :
             "Connecting..."}
          </span>
        </div>

        {/* Command Search Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-obsidian-900/90 border border-white/10 text-slate-400 hover:text-slate-200 hover:border-cyan-500/40 transition-all text-xs w-32 sm:w-52 justify-between group shadow-inner"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            <span className="truncate">Quick search...</span>
          </span>
          <kbd className="hidden sm:inline-block text-[10px] bg-obsidian-800 text-slate-300 px-1.5 py-0.5 rounded border border-white/10 font-mono font-medium">
            ⌘K
          </kbd>
        </button>


        {/* Demo Mode Notice Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-medium">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>DPDP Act 2023 Ruleset</span>
        </div>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setUnreadCount(0);
            }}
            title="Audit Notifications"
            className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-obsidian-800 border border-transparent hover:border-white/10 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06B6D4] animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-obsidian-900 border border-white/10 shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-100">Audit Notifications</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Live Telemetry
                  </span>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Notification Filter Tabs */}
              <div className="flex gap-2 py-2 text-xs border-b border-white/[0.08]">
                <button
                  onClick={() => setActiveNotificationTab('all')}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    activeNotificationTab === 'all'
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setActiveNotificationTab('critical')}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    activeNotificationTab === 'critical'
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Critical Only ({notifications.filter((n) => n.severity === 'critical').length})
                </button>
              </div>

              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredActivities.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No notifications recorded.
                  </div>
                ) : (
                  filteredActivities.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => {
                        if (act.link) navigate(act.link);
                        setShowNotifications(false);
                      }}
                      className="p-2.5 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-white/[0.07] transition-colors text-xs space-y-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full flex-shrink-0",
                              act.severity === 'critical' ? "bg-rose-500" :
                              act.severity === 'high' ? "bg-amber-400" :
                              act.severity === 'success' ? "bg-emerald-400" : "bg-cyan-400"
                            )}
                          />
                          <span className="font-semibold text-slate-200 truncate">{act.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                          {act.timestamp.includes('T') ? act.timestamp.slice(11, 16) : act.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {act.description}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/[0.08] text-center">
                <Link
                  to="/history"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  View full compliance event stream →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick New Scan Button */}
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs transition-all shadow-cyan-sm hover:shadow-cyan-400/30 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
          <span className="hidden sm:inline">New Scan</span>
        </button>

        {/* User Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 pl-2 border-l border-white/10 text-left hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-500 p-[1px]">
              <div className="w-full h-full rounded-[11px] bg-obsidian-900 flex items-center justify-center text-cyan-300 text-xs font-bold font-mono">
                {userInitials}
              </div>
            </div>
            <div className="hidden xl:flex flex-col">
              <span className="text-xs font-semibold text-slate-200 leading-tight">
                {currentUser?.fullName || 'Aditi Deshmukh'}
              </span>
              <span className="text-[10px] text-cyan-400 font-mono uppercase">
                {currentUser?.role === 'dpo' ? 'Data Protection Officer' : (currentUser?.role || 'Auditor')}
              </span>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-obsidian-900 border border-white/10 shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs space-y-2">
              <div className="p-2.5 rounded-xl bg-obsidian-850 border border-white/[0.08]">
                <div className="font-semibold text-white">{currentUser?.fullName || 'Aditi Deshmukh'}</div>
                <div className="text-[11px] text-slate-400">{currentUser?.email || 'dpo@bharatprivacy.in'}</div>
                <div className="text-[10px] text-cyan-400 font-mono mt-1">Bharat Privacy Labs Ltd.</div>
              </div>

              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowLoginModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-obsidian-800 transition-colors text-left"
                >
                  <User className="w-4 h-4 text-cyan-400" />
                  <span>Switch Account / Sign In</span>
                </button>
                <Link
                  to="/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-obsidian-800 transition-colors"
                >
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>DPO Designation & Ruleset</span>
                </Link>
                <Link
                  to="/history"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-obsidian-800 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Verified Audit Archive</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>

              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between px-2 text-[11px] text-slate-500">
                <span>DPDP-Guard IN</span>
                <span className="font-mono text-emerald-400">Authenticated</span>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Auth Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(user) => setCurrentUser(user)}
      />
    </header>
  );
};

