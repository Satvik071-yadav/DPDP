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
  const pageInfo = pageTitles[currentPath] || { title: 'PrivaCraft', category: 'Platform', subtitle: 'Privacy Intelligence & Compliance Auditing' };

  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  // Subscribe to auth state updates across the app
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

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
      setCurrentUser(user);
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
    setCurrentUser(null);
    setShowProfileMenu(false);
  };

  return (
    <header className="h-16 bg-[#FFFFFF]/90 backdrop-blur-xl border-b border-[#E4E4E7] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
          title="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-[#71717A] font-medium truncate">
            <span className="text-[#71717A] hidden sm:inline">PrivaCraft</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E4E4E7] hidden sm:inline" />
            <span className="text-[#71717A] hidden sm:inline">{pageInfo.category}</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E4E4E7] hidden sm:inline" />
            <h1 className="text-xs sm:text-sm font-bold text-[#18181B] tracking-tight truncate">
              {pageInfo.title}
            </h1>
          </div>
          <span className="hidden md:inline-block text-[11px] text-[#71717A] font-normal truncate mt-0.5">
            {pageInfo.subtitle}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Live Backend Connection Indicator */}
        <div 
          title={isBackendHealthy ? "FastAPI Gateway Online & Synchronized" : "Backend Gateway Offline or Disconnected"}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E4E4E7] text-[11px] font-mono"
        >
          <span className={cn(
            "w-2 h-2 rounded-full",
            isBackendHealthy === true ? "bg-[#15803D] animate-pulse" :
            isBackendHealthy === false ? "bg-[#B91C1C]" :
            "bg-[#B45309] animate-pulse"
          )} />
          <span className="text-[#71717A]">
            {isBackendHealthy === true ? "Gateway: Live" :
             isBackendHealthy === false ? "Gateway: Offline" :
             "Connecting..."}
          </span>
        </div>

        {/* Command Search Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] hover:text-[#18181B] hover:border-[#52796F] transition-all text-xs w-32 sm:w-52 justify-between group shadow-sm"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[#71717A] group-hover:text-[#52796F] transition-colors" />
            <span className="truncate">Quick search...</span>
          </span>
          <kbd className="hidden sm:inline-block text-[10px] bg-[#FFFFFF] text-[#71717A] px-1.5 py-0.5 rounded border border-[#E4E4E7] font-mono font-medium">
            ⌘K
          </kbd>
        </button>

        {/* Demo Mode Notice Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-xs font-mono font-medium">
          <span className="w-2 h-2 rounded-full bg-[#52796F] animate-pulse" />
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
            className="relative p-2 rounded-xl text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] border border-transparent hover:border-[#E4E4E7] transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#52796F] animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[#18181B]">Audit Notifications</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#52796F]/10 text-[#52796F] border border-[#52796F]/20">
                    Live Telemetry
                  </span>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-[#71717A] hover:text-[#18181B] p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Notification Filter Tabs */}
              <div className="flex gap-2 py-2 text-xs border-b border-[#E4E4E7]">
                <button
                  onClick={() => setActiveNotificationTab('all')}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    activeNotificationTab === 'all'
                      ? "bg-[#F1F5F9] text-[#52796F] border border-[#52796F]/30"
                      : "text-[#71717A] hover:text-[#18181B]"
                  )}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setActiveNotificationTab('critical')}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    activeNotificationTab === 'critical'
                      ? "bg-red-50 text-[#B91C1C] border border-[#B91C1C]/20"
                      : "text-[#71717A] hover:text-[#18181B]"
                  )}
                >
                  Critical Only ({notifications.filter((n) => n.severity === 'critical').length})
                </button>
              </div>

              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredActivities.length === 0 ? (
                  <div className="py-8 text-center text-[#71717A] text-xs">
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
                      className="p-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#E4E4E7]/60 border border-[#E4E4E7] transition-colors text-xs space-y-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full flex-shrink-0",
                              act.severity === 'critical' ? "bg-[#B91C1C]" :
                              act.severity === 'high' ? "bg-[#B45309]" :
                              act.severity === 'success' ? "bg-[#15803D]" : "bg-[#2563EB]"
                            )}
                          />
                          <span className="font-semibold text-[#18181B] truncate">{act.title}</span>
                        </div>
                        <span className="text-[10px] text-[#71717A] font-mono flex-shrink-0">
                          {act.timestamp.includes('T') ? act.timestamp.slice(11, 16) : act.timestamp}
                        </span>
                      </div>
                      <p className="text-[#71717A] text-[11px] leading-relaxed">
                        {act.description}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-[#E4E4E7] text-center">
                <Link
                  to="/history"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-[#52796F] hover:text-[#405F57] font-semibold"
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
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs transition-colors shadow-sm active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
          <span className="hidden sm:inline">New Scan</span>
        </button>

        {/* User Profile Dropdown or Sign In CTA */}
        {currentUser ? (
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 pl-2 border-l border-[#E4E4E7] text-left hover:opacity-90 transition-opacity"
              title="User Profile & Session"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F] text-xs font-bold font-mono">
                {userInitials}
              </div>
              <div className="hidden xl:flex flex-col">
                <span className="text-xs font-semibold text-[#18181B] leading-tight">
                  {currentUser.fullName}
                </span>
                <span className="text-[10px] text-[#52796F] font-mono uppercase">
                  {currentUser.role === 'dpo' ? 'Data Protection Officer' : currentUser.role}
                </span>
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs space-y-2">
                <div className="p-2.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7]">
                  <div className="font-semibold text-[#18181B]">{currentUser.fullName}</div>
                  <div className="text-[11px] text-[#71717A]">{currentUser.email}</div>
                  <div className="text-[10px] text-[#52796F] font-mono mt-1">Bharat Privacy Labs Ltd.</div>
                </div>

                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowLoginModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-[#52796F]" />
                    <span>Switch Account / Re-authenticate</span>
                  </button>
                  <Link
                    to="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
                  >
                    <Sliders className="w-4 h-4 text-[#52796F]" />
                    <span>DPO Designation & Ruleset</span>
                  </Link>
                  <Link
                    to="/history"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                    <span>Verified Audit Archive</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#B91C1C] hover:bg-red-50 transition-colors text-left font-medium"
                    title="Sign out and destroy session"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between px-2 text-[11px] text-[#71717A]">
                  <span>PrivaCraft IN</span>
                  <span className="font-mono text-[#15803D] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse" />
                    Authenticated
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F1F5F9] hover:bg-[#E4E4E7] border border-[#E4E4E7] hover:border-[#52796F]/40 text-[#18181B] font-semibold text-xs transition-colors shadow-sm active:scale-95"
            title="Sign in as Data Protection Officer or Auditor"
          >
            <User className="w-3.5 h-3.5 text-[#52796F]" />
            <span>Sign In</span>
          </button>
        )}
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

