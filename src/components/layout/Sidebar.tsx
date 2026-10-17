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
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard, tooltip: 'Security & Compliance Overview' },
  { name: 'Scan Target', path: '/scan', icon: Radar, tooltip: 'Live Browser & Protocol Audit' },
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
        "relative flex flex-col bg-obsidian-900 border-r border-white/[0.08] transition-all duration-300 z-30 select-none shadow-2xl h-full",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-3.5 border-b border-white/[0.07] bg-obsidian-950/60 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Animated Obsidian Identity Mark */}
          <div className="relative flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 via-obsidian-850 to-violet-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-cyan-sm group">
            <span className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-sm animate-pulse" />
            <ShieldCheck className="w-5 h-5 stroke-[2.2] relative z-10 transition-transform duration-300 group-hover:scale-110" />
            <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 ring-2 ring-obsidian-900" />
          </div>

          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-white truncate flex items-center gap-1.5">
                DPDP-Guard
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  PRO
                </span>
              </span>
              <span className="text-[10px] text-slate-400 tracking-wider uppercase font-medium truncate">
                Privacy Intelligence
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors border border-transparent hover:border-white/10"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 text-cyan-400" /> : <ChevronLeft className="w-4 h-4" />}
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
                    ? "bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-white border border-cyan-500/35 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-obsidian-800/80 border border-transparent"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      "w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 transition-all duration-200",
                      isActive
                        ? item.aiBadge 
                          ? "text-violet-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                          : "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "text-slate-400 group-hover:text-slate-200 group-hover:scale-105"
                    )}
                  />

                  {!collapsed && (
                    <span className="truncate flex-1 tracking-tight">{item.name}</span>
                  )}

                  {!collapsed && item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {item.badge}
                    </span>
                  )}

                  {!collapsed && item.aiBadge && (
                    <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      AI
                    </span>
                  )}

                  {!collapsed && item.highlightText && (
                    <span className="px-1.5 py-0.2 text-[9px] uppercase tracking-wider font-extrabold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {item.highlightText}
                    </span>
                  )}

                  {/* Left Accent Glow Bar */}
                  {isActive && (
                    <span className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r shadow-sm",
                      item.aiBadge ? "bg-violet-400 shadow-violet-glow" : "bg-cyan-400 shadow-cyan-sm"
                    )} />
                  )}
                </>
              )}
            </NavLink>

            {/* Collapsed Hover Tooltip */}
            {collapsed && hoveredItem === item.name && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-obsidian-850 border border-white/10 text-slate-100 text-xs font-medium whitespace-nowrap shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2">
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono text-rose-300 bg-rose-500/20 px-1 py-0.2 rounded">
                      {item.badge}
                    </span>
                  )}
                  {item.aiBadge && (
                    <span className="text-[9px] font-mono text-violet-300 bg-violet-500/20 px-1 py-0.2 rounded">
                      AI
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-normal">{item.tooltip}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Compliance Standard Footer */}
      {!collapsed ? (
        <div className="p-3 mx-2.5 mb-3 rounded-xl bg-obsidian-950/70 border border-white/[0.07] text-xs shadow-inner">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px]">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>DPDP Act 2023</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Statutory auditing active for Data Fiduciary obligations and consent state evidence.
          </p>
          <div className="mt-2 pt-2 border-t border-white/[0.07] flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Jurisdiction: India</span>
            <span className="text-cyan-400">CERT-In Aligned</span>
          </div>
        </div>
      ) : (
        <div className="p-2 mb-3 mx-auto">
          <div 
            title="DPDP Act 2023 Statutory Protection Active"
            className="w-9 h-9 rounded-xl bg-obsidian-850 border border-white/[0.08] flex items-center justify-center text-cyan-400 cursor-help hover:border-cyan-500/40 transition-colors"
          >
            <Lock className="w-4 h-4" />
          </div>
        </div>
      )}
    </aside>
  );
};

