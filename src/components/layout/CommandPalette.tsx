import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Radar, 
  AlertTriangle, 
  Network, 
  Wrench, 
  History, 
  Settings, 
  FileText, 
  ExternalLink,
  X 
} from 'lucide-react';
import { api } from '@/services/api';
import { Finding } from '@/types';
import { DEMO_FINDINGS } from '@/data/mockData';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [findings, setFindings] = useState<Finding[]>(DEMO_FINDINGS);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    async function loadFindings() {
      try {
        const list = await api.getFindings();
        if (list && list.length > 0) {
          setFindings(list);
        }
      } catch {
        // Fall back to existing fixtures
      }
    }
    loadFindings();
  }, []);

  const quickPages = [
    { title: 'Overview Dashboard', path: '/', icon: FileText, category: 'Navigation', hint: 'SOC Overview' },
    { title: 'Scan Target Website', path: '/scan', icon: Radar, category: 'Navigation', hint: 'Protocol Scanner' },
    { title: 'Forensic Findings', path: '/findings', icon: AlertTriangle, category: 'Navigation', hint: '6 DPDP Violations' },
    { title: 'Privacy Flow Visualizer', path: '/privacy-flow', icon: Network, category: 'Navigation', hint: 'Interactive Graph' },
    { title: 'Fix & Verify Workbench', path: '/fix-verify', icon: Wrench, category: 'Navigation', hint: 'Remediation Sandbox' },
    { title: 'AI Copilot Investigator', path: '/copilot', icon: FileText, category: 'Navigation', hint: 'Evidence-Grounded AI' },
    { title: 'Audit History & Archives', path: '/history', icon: History, category: 'Navigation', hint: 'Compliance Records' },
    { title: 'Platform Settings & DPO', path: '/settings', icon: Settings, category: 'Navigation', hint: 'Configuration' },
  ];

  const filteredPages = quickPages.filter(p => 
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.hint.toLowerCase().includes(query.toLowerCase())
  );

  const filteredFindings = findings.filter(f => 
    f.title.toLowerCase().includes(query.toLowerCase()) ||
    f.dpdpSection.toLowerCase().includes(query.toLowerCase()) ||
    f.id.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...filteredPages.map(p => ({ type: 'page' as const, ...p })),
    ...filteredFindings.map(f => ({ type: 'finding' as const, ...f })),
  ];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      if (isOpen && allItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % allItems.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = allItems[selectedIndex];
          if (selected) {
            if (selected.type === 'page') {
              navigate(selected.path);
            } else {
              navigate(`/findings?id=${selected.id}`);
            }
            onClose();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, allItems, selectedIndex, navigate]);

  if (!isOpen) return null;

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="relative z-10 w-full max-w-2xl bg-obsidian-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Input box */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08] bg-obsidian-950/70">
          <Search className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search pages, DPDP findings, statutory sections, or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="text-xs text-slate-500 hover:text-slate-300 font-mono"
            >
              Clear
            </button>
          )}
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-obsidian-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Navigation group */}
          {filteredPages.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Workflows & Console Views
              </div>
              <div className="mt-1 space-y-0.5">
                {filteredPages.map((page, idx) => {
                  const isCurrent = selectedIndex === idx;
                  return (
                    <button
                      key={page.path}
                      onClick={() => handleSelect(page.path)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left group ${
                        isCurrent 
                          ? 'bg-obsidian-800 text-white border border-cyan-500/30' 
                          : 'text-slate-300 hover:text-white hover:bg-obsidian-850 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <page.icon className={`w-4 h-4 ${isCurrent ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'}`} />
                        <span className="font-medium">{page.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">{page.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Findings group */}
          {filteredFindings.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                DPDP Findings & Forensic Evidence
              </div>
              <div className="mt-1 space-y-0.5">
                {filteredFindings.map((finding, idx) => {
                  const itemIndex = filteredPages.length + idx;
                  const isCurrent = selectedIndex === itemIndex;
                  return (
                    <button
                      key={finding.id}
                      onClick={() => handleSelect(`/findings?id=${finding.id}`)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left group ${
                        isCurrent 
                          ? 'bg-obsidian-800 text-white border border-cyan-500/30' 
                          : 'text-slate-300 hover:text-white hover:bg-obsidian-850 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="font-mono text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold">
                          {finding.id}
                        </span>
                        <span className="truncate font-medium">{finding.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] font-mono text-slate-400">{finding.dpdpSection}</span>
                        <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded ${
                          finding.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' :
                          finding.severity === 'high' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {finding.severity}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {allItems.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-500">
              No matching pages, findings, or sections found for "{query}".
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-obsidian-950/80 border-t border-white/[0.08] text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>Navigate: <kbd className="font-mono bg-obsidian-850 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↑</kbd> <kbd className="font-mono bg-obsidian-850 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↓</kbd></span>
            <span>Select: <kbd className="font-mono bg-obsidian-850 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">↵</kbd></span>
          </div>
          <span>Close: <kbd className="font-mono bg-obsidian-850 px-1.5 py-0.5 rounded border border-white/10 text-slate-300">ESC</kbd></span>
        </div>
      </div>
    </div>
  );
};

