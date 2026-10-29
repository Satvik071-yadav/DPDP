import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShieldCheck, 
  LayoutDashboard, 
  Radar, 
  AlertTriangle, 
  Network, 
  Wrench, 
  History, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Lock,
  Sparkles,
  Zap,
  Activity,
  Globe,
  CreditCard,
  Database
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard, tooltip: 'Security & Compliance Overview' },
  { name: 'Scan Target', path: '/scan', icon: Radar, tooltip: 'Live Browser & Protocol Audit' },
  { name: 'Database Audit', path: '/database-audit', icon: Database, tooltip: 'HIPAA & SQL Data Store Compliance' },
  { name: 'Domains', path: '/domains', icon: Globe, tooltip: 'Website & Ownership Verification' },
  { name: 'Subscription', path: '/subscription', icon: CreditCard, tooltip: 'Plans & Audit Quotas' },
  { name: 'Findings', path: '/findings', icon: AlertTriangle, badge: '6', tooltip: 'Forensic Privacy Findings' },
  { name: 'Privacy Flow', path: '/privacy-flow', icon: Network, highlightText: 'Interactive', tooltip: 'Visual Data Flow & Consent Graph' },
  { name: 'Fix & Verify', path: '/fix-verify', icon: Wrench, highlightText: 'Workbench', tooltip: 'Patch & Live Verification Sandbox' },
  { name: 'AI Copilot', path: '/copilot', icon: Sparkles, aiBadge: true, tooltip: 'Evidence-Grounded AI Investigator' },
  { name: 'Scan History', path: '/history', icon: History, tooltip: 'Compliance Audit Logs & Reports' },
  { name: 'Settings', path: '/settings', icon: Settings, tooltip: 'DPO Profile & API Settings' },
];


export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-[#FFFFFF] border-r border-[#E4E4E7] transition-all duration-300 z-30 select-none shadow-sm h-full",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-3.5 border-b border-[#E4E4E7] bg-[#FFFFFF]">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Identity Mark */}
          <div className="relative flex-shrink-0 w-9 h-9 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F] group">
            <ShieldCheck className="w-5 h-5 stroke-[2.2] relative z-10 transition-transform duration-300 group-hover:scale-110" />
            <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#52796F] ring-2 ring-[#FFFFFF]" />
          </div>

          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-[#18181B] truncate flex items-center gap-1.5" title="Crafting trust through privacy.">
                PrivaCraft
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#52796F]/10 text-[#52796F] border border-[#52796F]/20">
                  PRO
                </span>
              </span>
              <span className="text-[10px] text-[#71717A] tracking-wider uppercase font-medium truncate" title="Crafting trust through privacy.">
                Privacy Intelligence & Compliance
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors border border-transparent hover:border-[#E4E4E7]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 text-[#52796F]" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <div
            key={item.path}
            className="relative"
            onMouseEnter={() => setHoveredItem(item.name)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-[#F1F5F9] text-[#18181B] border border-[#52796F]/30 shadow-sm font-semibold"
                    : "text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9]/80 border border-transparent"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      "w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 transition-all duration-200",
                      isActive
                        ? "text-[#52796F]"
                        : "text-[#71717A] group-hover:text-[#18181B] group-hover:scale-105"
                    )}
                  />

                  {!collapsed && (
                    <span className="truncate flex-1 tracking-tight">{item.name}</span>
                  )}

                  {!collapsed && item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-red-50 text-[#B91C1C] border border-[#B91C1C]/20">
                      {item.badge}
                    </span>
                  )}

                  {!collapsed && item.aiBadge && (
                    <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-[#F1F5F9] text-[#71717A] border border-[#E4E4E7]">
                      AI
                    </span>
                  )}

                  {!collapsed && item.highlightText && (
                    <span className="px-1.5 py-0.2 text-[9px] uppercase tracking-wider font-extrabold rounded bg-[#52796F]/10 text-[#52796F] border border-[#52796F]/20">
                      {item.highlightText}
                    </span>
                  )}

                  {/* Left Accent Bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-[#52796F]" />
                  )}
                </>
              )}
            </NavLink>

            {/* Collapsed Hover Tooltip */}
            {collapsed && hoveredItem === item.name && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E4E4E7] text-[#18181B] text-xs font-medium whitespace-nowrap shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2">
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono text-[#B91C1C] bg-red-50 px-1 py-0.2 rounded border border-[#B91C1C]/20">
                      {item.badge}
                    </span>
                  )}
                  {item.aiBadge && (
                    <span className="text-[9px] font-mono text-[#71717A] bg-[#F1F5F9] px-1 py-0.2 rounded border border-[#E4E4E7]">
                      AI
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#71717A] font-normal">{item.tooltip}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Compliance Standard Footer */}
      {!collapsed ? (
        <div className="p-3 mx-2.5 mb-3 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[#18181B] font-semibold text-[11px]">
              <Lock className="w-3.5 h-3.5 text-[#52796F]" />
              <span>DPDP Act 2023</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-green-50 text-[#15803D] border border-[#15803D]/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse" />
              Active
            </span>
          </div>
          <p className="text-[11px] text-[#71717A] leading-relaxed">
            Statutory auditing active for Data Fiduciary obligations and consent state evidence.
          </p>
          <div className="mt-2 pt-2 border-t border-[#E4E4E7] flex items-center justify-between text-[10px] text-[#71717A] font-mono">
            <span>Jurisdiction: India</span>
            <span className="text-[#52796F]">CERT-In Aligned</span>
          </div>
        </div>
      ) : (
        <div className="p-2 mb-3 mx-auto">
          <div 
            title="DPDP Act 2023 Statutory Protection Active"
            className="w-9 h-9 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F] cursor-help hover:border-[#52796F]/40 transition-colors"
          >
            <Lock className="w-4 h-4" />
          </div>
        </div>
      )}
    </aside>
  );
};

