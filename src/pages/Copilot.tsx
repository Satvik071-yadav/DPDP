import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Copy, 
  Check, 
  Trash2, 
  AlertTriangle, 
  ShieldCheck, 
  FileCode2, 
  ArrowRight, 
  Info, 
  ChevronRight, 
  HelpCircle, 
  RefreshCw, 
  Sliders, 
  Cpu, 
  Network, 
  Wrench, 
  ExternalLink,
  ShieldAlert,
  Server,
  Lock,
  LogIn,
  UserPlus
} from 'lucide-react';
import { api } from '@/services/api';
import { copilotService } from '@/services/copilotService';
import { authService } from '@/services/authService';
import { LoginModal } from '@/components/auth/LoginModal';
import { Finding, Severity } from '@/types';
import { CopilotMessage, CopilotMode, CopilotStructuredResponse } from '@/types/copilot';
import { formatSeverity } from '@/lib/utils';

const SUGGESTED_QUESTIONS = [
  'Explain this finding in simple language.',
  'What evidence supports this finding?',
  'What could happen if this issue is not fixed?',
  'How should a developer fix it?',
  'How can I verify the fix?',
  'What should a business owner do next?',
];

export const Copilot: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'register'>('login');

  // Page Loading & Error State
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string>(
    searchParams.get('findingId') || 'DPDP-HIGH-007'
  );

  // Copilot operating mode: 'backend' (default) vs 'demo'
  const [copilotMode, setCopilotMode] = useState<CopilotMode>('backend');

  // Chat conversation state
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load findings with guaranteed cleanup and error capture
  const loadFindings = async () => {
    if (!authService.isAuthenticated()) {
      setFindings([]);
      setIsPageLoading(false);
      setPageError(null);
      return;
    }

    setIsPageLoading(true);
    setPageError(null);
    try {
      const list = await api.getFindings();
      setFindings(list);

      const urlFindingId = searchParams.get('findingId');
      if (urlFindingId && list.some((f) => f.id === urlFindingId)) {
        setSelectedFindingId(urlFindingId);
      } else if (list.length > 0 && !list.some((f) => f.id === selectedFindingId)) {
        const bola = list.find((f) => f.id === 'DPDP-HIGH-007');
        setSelectedFindingId(bola ? bola.id : list[0].id);
      }
    } catch (err: any) {
      setPageError(err?.message || 'Failed to load security findings for Copilot analysis.');
    } finally {
      setIsPageLoading(false);
    }
  };

  // Sync auth state changes across the application
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        loadFindings();
      } else {
        setFindings([]);
        setIsPageLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Reload findings when searchParams change or on initial mount
  useEffect(() => {
    loadFindings();
  }, [searchParams]);

  const activeFinding = findings.find((f) => f.id === selectedFindingId) || findings[0];

  // Initialize or reset conversation when active finding changes
  useEffect(() => {
    if (activeFinding) {
      const initialGreeting: CopilotMessage = {
        id: `greeting-${activeFinding.id}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: `I am your evidence-grounded investigation copilot. I have loaded the forensic evidence for [${activeFinding.id}] "${activeFinding.title}". How would you like me to analyze this finding for your team?`,
        suggestedNextQuestions: SUGGESTED_QUESTIONS.slice(0, 3),
        isDemoResponse: copilotMode === 'demo',
      };
      setMessages([initialGreeting]);
      setErrorMessage(null);
    }
  }, [selectedFindingId, activeFinding, copilotMode]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle Finding Switch
  const handleSelectFinding = (findingId: string) => {
    setSelectedFindingId(findingId);
    setSearchParams({ findingId });
  };

  // Handle Send Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading || !activeFinding) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: new Date().toISOString(),
      content: text,
    };

    const newConversation = [...messages, userMsg];
    setMessages(newConversation);
    setInputValue('');
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const assistantReply = await copilotService.sendMessage({
        messages: newConversation,
        finding: activeFinding,
        mode: copilotMode,
      });
      setMessages((prev) => [...prev, assistantReply]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to generate response.');
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard navigation: Enter sends, Shift+Enter new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy response
  const handleCopyResponse = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Clear conversation
  const handleClearChat = () => {
    if (activeFinding) {
      setMessages([
        {
          id: `greeting-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          content: `Conversation reset. Ready to analyze [${activeFinding.id}] "${activeFinding.title}". Choose a question below or ask anything about this finding.`,
          suggestedNextQuestions: SUGGESTED_QUESTIONS.slice(0, 3),
          isDemoResponse: copilotMode === 'demo',
        },
      ]);
      setErrorMessage(null);
    }
  };

  // 1. Unauthenticated Gateway State
  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-12 px-4">
        <div className="relative overflow-hidden rounded-3xl bg-[#FFFFFF] border border-[#E4E4E7] p-8 sm:p-12 shadow-subtle text-center">
          <div className="relative z-10 max-w-xl mx-auto space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] flex items-center justify-center mx-auto shadow-subtle">
              <Lock className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-xs font-mono font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-[#52796F]" />
                <span>AI INVESTIGATION COPILOT • TENANT RESTRICTED</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#18181B] tracking-tight font-sans">
                Sign In to Access Copilot Workspace
              </h2>
              <p className="text-sm text-[#71717A] leading-relaxed">
                Forensic telemetry, code remediation strategies, and AI-assisted investigation contexts are strictly isolated per tenant. Sign in to analyze your organization's security findings.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-sm shadow-subtle transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Compliance Console</span>
              </button>
              <button
                onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-sm transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-[#52796F]" />
                <span>Register Account</span>
              </button>
            </div>
          </div>
        </div>

        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
            loadFindings();
          }}
          initialMode={loginModalMode}
        />
      </div>
    );
  }

  // 2. Active Page Loading State
  if (isPageLoading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] flex items-center justify-center mx-auto animate-pulse shadow-subtle">
          <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#18181B] font-sans">Loading Copilot Workspace...</p>
          <p className="text-xs text-[#71717A] font-mono">Retrieving security findings and forensic telemetry from PrivaCraft backend</p>
        </div>
      </div>
    );
  }

  // 3. Page Error State with Retry
  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 space-y-4">
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-[#B91C1C] space-y-4 shadow-subtle">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[#B91C1C] flex-shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-[#18181B] font-sans">Unable to Load Copilot Workspace</h3>
              <p className="text-xs text-[#B91C1C] leading-relaxed font-mono">{pageError}</p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={loadFindings}
              className="px-4 py-2 rounded-xl bg-red-50 hover:bg-[#B91C1C]/30 border border-red-200 text-[#18181B] font-semibold text-xs transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Empty Findings State
  if (findings.length === 0 || !activeFinding) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] text-[#71717A] flex items-center justify-center mx-auto shadow-subtle">
          <ShieldAlert className="w-7 h-7 text-[#71717A]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#18181B] font-sans">No Security Findings Detected</h2>
          <p className="text-xs sm:text-sm text-[#71717A] max-w-md mx-auto leading-relaxed">
            Your organization has zero active findings or recorded privacy violations. Run an automated compliance scan to detect issues and unlock evidence-grounded AI investigations.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/scan"
            className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs shadow-subtle transition-all flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch Privacy Audit Scan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={loadFindings}
            className="px-4 py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    );
  }

  const sev = formatSeverity(activeFinding.severity);

  return (
    <div className="space-y-4 h-[calc(100vh-8.2rem)] flex flex-col pb-2">
      {/* 1. Page Header & Subtitle */}
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-4 shadow-subtle flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#52796F]" />
                AI INVESTIGATION COPILOT
              </span>
              {copilotMode === 'demo' ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-green-50 text-[#15803D] border border-green-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-[#15803D]" />
                  DEMO MODE: DETERMINISTIC GROUNDED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#52796F]/20 text-[#52796F] border border-[#52796F]/20 flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-[#52796F]" />
                  REAL AI MODE: FASTAPI BACKEND
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] flex items-center gap-2 font-sans">
              <span>AI Investigation Copilot</span>
            </h1>
            <p className="text-xs text-[#71717A]">
              Turn technical evidence into clear, actionable decisions. Evidence-grounded explanations without fabricated findings.
            </p>
          </div>

          {/* Toolbar: Finding Selector & Mode Switch */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Finding Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-1.5 text-xs shadow-inner">
              <span className="text-[#71717A] font-medium text-[11px] font-mono">Finding:</span>
              <select
                value={selectedFindingId}
                onChange={(e) => handleSelectFinding(e.target.value)}
                className="bg-transparent text-[#18181B] text-xs font-semibold focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {findings.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#F8FAFC] text-[#18181B]">
                    [{f.id}] {f.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Switch Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs">
              <button
                onClick={() => setCopilotMode('demo')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  copilotMode === 'demo'
                    ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F]'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                Demo Fixtures
              </button>
              <button
                onClick={() => setCopilotMode('backend')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  copilotMode === 'backend'
                    ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F]'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                FastAPI Mode
              </button>
            </div>

            {/* Reset / Clear Chat */}
            <button
              onClick={handleClearChat}
              className="p-2 rounded-xl bg-[#F8FAFC] hover:bg-red-50 border border-[#E4E4E7] hover:border-red-200 text-[#71717A] hover:text-[#B91C1C] transition-colors"
              title="Clear conversation for this finding"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Active Finding Context Card */}
      <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-subtle flex-shrink-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sev.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            <span className="font-mono text-xs font-bold text-[#52796F] bg-[#52796F]/10 px-2 py-0.5 rounded border border-[#52796F]/20">
              {activeFinding.id}
            </span>
            <span className="text-[#71717A] font-mono text-[11px]">
              {activeFinding.dpdpSection}
            </span>
          </div>
          <div className="font-semibold text-[#18181B] truncate text-xs font-sans">
            {activeFinding.title}
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/findings?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] hover:text-[#18181B] text-[11px] font-medium transition-colors"
          >
            Inspect Evidence
          </Link>
          <Link
            to={`/privacy-flow?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-[11px] font-medium transition-colors flex items-center gap-1"
          >
            <Network className="w-3 h-3 text-[#52796F]" />
            <span>Privacy Flow</span>
          </Link>
          <Link
            to={`/fix-verify?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] text-[11px] font-bold transition-all flex items-center gap-1 shadow-subtle"
          >
            <Wrench className="w-3 h-3" />
            <span>Fix & Verify</span>
          </Link>
        </div>
      </div>

      {/* 3. Main Conversation Stream */}
      <div className="flex-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-2xl p-4 overflow-y-auto space-y-4 shadow-inner min-h-0">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 text-xs leading-relaxed ${
                isUser ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                  isUser
                    ? 'bg-[#52796F]/20 border border-[#52796F]/20 text-[#52796F]'
                    : 'bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F]'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] md:max-w-[80%] rounded-2xl p-4 space-y-3.5 shadow-subtle ${
                  isUser
                    ? 'bg-[#F1F5F9] border border-[#52796F]/20 text-[#18181B] rounded-tr-none'
                    : 'bg-[#FFFFFF] border border-[#E4E4E7] text-[#18181B] rounded-tl-none shadow-subtle'
                }`}
              >
                {/* User Message Content */}
                {isUser && <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                {/* Assistant Structured Message Content */}
                {!isUser && msg.structuredResponse ? (
                  <div className="space-y-4">
                    {/* 1. Summary paragraph */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-[#52796F] uppercase tracking-wider font-bold">
                          EXECUTIVE SUMMARY
                        </span>
                        {msg.isDemoResponse && (
                          <span className="text-[10px] font-mono bg-[#52796F]/10 text-[#52796F] px-2 py-0.5 rounded border border-[#52796F]/20">
                            DEMO FIXTURE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#18181B] leading-relaxed font-sans font-medium">
                        {msg.structuredResponse.summary}
                      </p>
                    </div>

                    {/* 2. What We Observed */}
                    {msg.structuredResponse.whatWeObserved.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1.5">
                        <span className="font-bold text-[11px] text-[#71717A] uppercase tracking-wider block font-mono">
                          1. What We Observed (Technical Evidence)
                        </span>
                        <ul className="space-y-1 text-[#18181B] text-xs">
                          {msg.structuredResponse.whatWeObserved.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] mt-1.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 3. Why It Matters */}
                    {msg.structuredResponse.whyItMatters && (
                      <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1">
                        <span className="font-bold text-[11px] text-[#52796F] uppercase tracking-wider block font-mono">
                          2. Why It Matters (Statutory & Security Impact)
                        </span>
                        <p className="text-[#71717A] text-xs leading-relaxed font-sans">
                          {msg.structuredResponse.whyItMatters}
                        </p>
                      </div>
                    )}

                    {/* 4. What Remains Uncertain */}
                    {msg.structuredResponse.whatRemainsUncertain && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-[#F59E0B]/25 space-y-1">
                        <span className="font-bold text-[11px] text-[#B45309] uppercase tracking-wider block flex items-center gap-1.5 font-mono">
                          <HelpCircle className="w-3.5 h-3.5 text-[#B45309]" />
                          3. What Remains Uncertain (Evidence Limits)
                        </span>
                        <p className="text-[#71717A] text-xs leading-relaxed font-sans">
                          {msg.structuredResponse.whatRemainsUncertain}
                        </p>
                      </div>
                    )}

                    {/* 5. Recommended Actions */}
                    {msg.structuredResponse.recommendedActions.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1.5">
                        <span className="font-bold text-[11px] text-[#15803D] uppercase tracking-wider block font-mono">
                          4. Recommended Actions
                        </span>
                        <ul className="space-y-1.5 text-[#18181B] text-xs">
                          {msg.structuredResponse.recommendedActions.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] mt-1.5 flex-shrink-0" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 6. How to Verify the Fix */}
                    {msg.structuredResponse.howToVerify.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1.5">
                        <span className="font-bold text-[11px] text-[#52796F] uppercase tracking-wider block font-mono">
                          5. How to Verify the Fix
                        </span>
                        <ul className="space-y-1 text-[#18181B] text-xs">
                          {msg.structuredResponse.howToVerify.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] mt-1.5 flex-shrink-0" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Evidence References */}
                    {msg.structuredResponse.evidenceReferences.length > 0 && (
                      <div className="pt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-[#71717A] uppercase font-bold tracking-wider font-mono">
                          Evidence References:
                        </span>
                        {msg.structuredResponse.evidenceReferences.map((ref) => (
                          <span
                            key={ref.id}
                            className="px-2 py-0.5 rounded font-mono text-[10px] bg-[#F8FAFC] text-[#52796F] border border-[#E4E4E7] flex items-center gap-1 shadow-subtle"
                            title={ref.snippet}
                          >
                            <FileCode2 className="w-3 h-3 text-[#52796F]" />
                            {ref.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Legal Disclaimer */}
                    <div className="pt-2 text-[10px] text-[#71717A] italic leading-relaxed border-t border-[#E4E4E7]">
                      {msg.structuredResponse.disclaimer}
                    </div>
                  </div>
                ) : (
                  !isUser && <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Assistant Message Actions */}
                {!isUser && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4E4E7] text-[11px]">
                    <span className="text-[#71717A] font-mono text-[10px]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <button
                      onClick={() =>
                        handleCopyResponse(
                          msg.id,
                          msg.structuredResponse
                            ? `${msg.structuredResponse.summary}\n\nWHAT WE OBSERVED:\n${msg.structuredResponse.whatWeObserved.join(
                                '\n'
                              )}\n\nWHY IT MATTERS:\n${msg.structuredResponse.whyItMatters}\n\nRECOMMENDED ACTIONS:\n${msg.structuredResponse.recommendedActions.join(
                                '\n'
                              )}`
                            : msg.content
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] hover:text-[#18181B] flex items-center gap-1 text-[10px] transition-colors"
                      title="Copy response to clipboard"
                    >
                      {copiedMessageId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-[#15803D]" />
                          <span className="text-[#15803D] font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Response</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] flex items-center justify-center flex-shrink-0 animate-pulse shadow-subtle">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] text-[#71717A] text-xs flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#52796F]" />
              <span>Analyzing technical evidence traces and statutory requirements...</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] text-xs flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B91C1C] flex-shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
            {copilotMode === 'backend' && (
              <button
                onClick={() => {
                  setCopilotMode('demo');
                  setErrorMessage(null);
                }}
                className="px-3 py-1 rounded-lg bg-red-50 hover:bg-[#B91C1C]/30 text-[#18181B] text-xs font-bold border border-red-200 flex-shrink-0"
              >
                Switch to Demo Mode
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Suggested Questions & Chat Input Area */}
      <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3 flex-shrink-0">
        {/* Suggested Question Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider flex-shrink-0 flex items-center gap-1 font-mono">
            <HelpCircle className="w-3 h-3 text-[#52796F]" />
            Suggested:
          </span>
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSendMessage(q)}
              className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] hover:border-[#52796F] text-[#71717A] hover:text-[#18181B] text-xs whitespace-nowrap transition-all flex-shrink-0 active:scale-95 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Text Input Row */}
        <div className="flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask a question about [${activeFinding.id}] (e.g. "What should a business owner do next?")...`}
              disabled={isLoading}
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs text-[#18181B] placeholder-[#94A3B8] focus:outline-none focus:border-[#52796F] resize-none max-h-24 disabled:opacity-50 font-sans"
            />
            <span className="absolute right-3 bottom-2.5 text-[10px] text-[#71717A] font-mono select-none hidden sm:inline">
              ↵ to send
            </span>
          </div>

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="p-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold shadow-subtle transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setShowLoginModal(false);
          loadFindings();
        }}
        initialMode={loginModalMode}
      />
    </div>
  );
};
