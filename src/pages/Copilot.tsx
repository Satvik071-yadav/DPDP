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
  Server
} from 'lucide-react';
import { api } from '@/services/api';
import { copilotService } from '@/services/copilotService';
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

  // Load findings
  useEffect(() => {
    async function load() {
      const list = await api.getFindings();
      setFindings(list);

      const urlFindingId = searchParams.get('findingId');
      if (urlFindingId && list.some((f) => f.id === urlFindingId)) {
        setSelectedFindingId(urlFindingId);
      } else if (list.length > 0 && !list.some((f) => f.id === selectedFindingId)) {
        const bola = list.find((f) => f.id === 'DPDP-HIGH-007');
        setSelectedFindingId(bola ? bola.id : list[0].id);
      }
    }
    load();
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

  if (!activeFinding) {
    return (
      <div className="py-24 text-center text-slate-400">
        Loading Copilot workspace...
      </div>
    );
  }

  const sev = formatSeverity(activeFinding.severity);

  return (
    <div className="space-y-4 h-[calc(100vh-8.2rem)] flex flex-col pb-2">
      {/* 1. Page Header & Subtitle */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-900/90 via-obsidian-850/80 to-obsidian-900/90 border border-white/[0.08] p-4 shadow-obsidian-card backdrop-blur-md flex-shrink-0">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 flex items-center gap-1.5 shadow-violet-glow">
                <Sparkles className="w-3 h-3 text-violet-400" />
                AI INVESTIGATION COPILOT
              </span>
              {copilotMode === 'demo' ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  DEMO MODE: DETERMINISTIC GROUNDED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/20 text-violet-200 border border-violet-500/40 flex items-center gap-1.5 shadow-violet-glow">
                  <Server className="w-3 h-3 text-violet-300" />
                  REAL AI MODE: FASTAPI BACKEND
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2 font-sans">
              <span>AI Investigation Copilot</span>
            </h1>
            <p className="text-xs text-slate-400">
              Turn technical evidence into clear, actionable decisions. Evidence-grounded explanations without fabricated findings.
            </p>
          </div>

          {/* Toolbar: Finding Selector & Mode Switch */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Finding Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs shadow-inner">
              <span className="text-slate-400 font-medium text-[11px] font-mono">Finding:</span>
              <select
                value={selectedFindingId}
                onChange={(e) => handleSelectFinding(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {findings.map((f) => (
                  <option key={f.id} value={f.id} className="bg-obsidian-950 text-slate-200">
                    [{f.id}] {f.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Switch Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-obsidian-950/80 border border-white/[0.08] text-xs">
              <button
                onClick={() => setCopilotMode('demo')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  copilotMode === 'demo'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Demo Fixtures
              </button>
              <button
                onClick={() => setCopilotMode('backend')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  copilotMode === 'backend'
                    ? 'bg-violet-500/25 text-violet-200 border border-violet-500/40 shadow-violet-glow font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                FastAPI Mode
              </button>
            </div>

            {/* Reset / Clear Chat */}
            <button
              onClick={handleClearChat}
              className="p-2 rounded-xl bg-obsidian-950/80 hover:bg-rose-500/10 border border-white/[0.08] hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition-colors"
              title="Clear conversation for this finding"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Active Finding Context Card */}
      <div className="p-3.5 rounded-xl bg-obsidian-900/80 border border-white/[0.08] text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-obsidian-card backdrop-blur-md flex-shrink-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sev.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {activeFinding.id}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {activeFinding.dpdpSection}
            </span>
          </div>
          <div className="font-semibold text-white truncate text-xs font-sans">
            {activeFinding.title}
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/findings?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
          >
            Inspect Evidence
          </Link>
          <Link
            to={`/privacy-flow?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-cyan-300 text-[11px] font-medium transition-colors flex items-center gap-1"
          >
            <Network className="w-3 h-3 text-cyan-400" />
            <span>Privacy Flow</span>
          </Link>
          <Link
            to={`/fix-verify?findingId=${activeFinding.id}`}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 text-[11px] font-bold transition-all flex items-center gap-1 shadow-cyan-glow"
          >
            <Wrench className="w-3 h-3" />
            <span>Fix & Verify</span>
          </Link>
        </div>
      </div>

      {/* 3. Main Conversation Stream */}
      <div className="flex-1 bg-obsidian-950/70 border border-white/[0.08] rounded-2xl p-4 overflow-y-auto space-y-4 shadow-inner min-h-0">
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
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                    : 'bg-violet-500/20 border border-violet-500/40 text-violet-300 shadow-violet-glow'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] md:max-w-[80%] rounded-2xl p-4 space-y-3.5 shadow-obsidian-card backdrop-blur-md ${
                  isUser
                    ? 'bg-cyan-950/30 border border-cyan-400/40 text-white rounded-tr-none'
                    : 'bg-obsidian-900/95 border border-violet-500/25 text-slate-200 rounded-tl-none shadow-violet-glow'
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
                        <span className="font-mono text-[10px] text-violet-400 uppercase tracking-wider font-bold">
                          EXECUTIVE SUMMARY
                        </span>
                        {msg.isDemoResponse && (
                          <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/20">
                            DEMO FIXTURE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white leading-relaxed font-sans font-medium">
                        {msg.structuredResponse.summary}
                      </p>
                    </div>

                    {/* 2. What We Observed */}
                    {msg.structuredResponse.whatWeObserved.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-obsidian-950/80 border border-white/[0.06] space-y-1.5">
                        <span className="font-bold text-[11px] text-slate-300 uppercase tracking-wider block font-mono">
                          1. What We Observed (Technical Evidence)
                        </span>
                        <ul className="space-y-1 text-slate-300 text-xs">
                          {msg.structuredResponse.whatWeObserved.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 3. Why It Matters */}
                    {msg.structuredResponse.whyItMatters && (
                      <div className="p-3.5 rounded-xl bg-obsidian-950/80 border border-white/[0.06] space-y-1">
                        <span className="font-bold text-[11px] text-cyan-300 uppercase tracking-wider block font-mono">
                          2. Why It Matters (Statutory & Security Impact)
                        </span>
                        <p className="text-slate-300 text-xs leading-relaxed font-sans">
                          {msg.structuredResponse.whyItMatters}
                        </p>
                      </div>
                    )}

                    {/* 4. What Remains Uncertain */}
                    {msg.structuredResponse.whatRemainsUncertain && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1">
                        <span className="font-bold text-[11px] text-amber-300 uppercase tracking-wider block flex items-center gap-1.5 font-mono">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                          3. What Remains Uncertain (Evidence Limits)
                        </span>
                        <p className="text-slate-300 text-xs leading-relaxed font-sans">
                          {msg.structuredResponse.whatRemainsUncertain}
                        </p>
                      </div>
                    )}

                    {/* 5. Recommended Actions */}
                    {msg.structuredResponse.recommendedActions.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-obsidian-950/80 border border-white/[0.06] space-y-1.5">
                        <span className="font-bold text-[11px] text-emerald-400 uppercase tracking-wider block font-mono">
                          4. Recommended Actions
                        </span>
                        <ul className="space-y-1.5 text-slate-300 text-xs">
                          {msg.structuredResponse.recommendedActions.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 6. How to Verify the Fix */}
                    {msg.structuredResponse.howToVerify.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-obsidian-950/80 border border-white/[0.06] space-y-1.5">
                        <span className="font-bold text-[11px] text-cyan-300 uppercase tracking-wider block font-mono">
                          5. How to Verify the Fix
                        </span>
                        <ul className="space-y-1 text-slate-300 text-xs">
                          {msg.structuredResponse.howToVerify.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(0,242,254,0.8)]" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Evidence References */}
                    {msg.structuredResponse.evidenceReferences.length > 0 && (
                      <div className="pt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-mono">
                          Evidence References:
                        </span>
                        {msg.structuredResponse.evidenceReferences.map((ref) => (
                          <span
                            key={ref.id}
                            className="px-2 py-0.5 rounded font-mono text-[10px] bg-obsidian-950 text-violet-300 border border-violet-500/30 flex items-center gap-1 shadow-sm"
                            title={ref.snippet}
                          >
                            <FileCode2 className="w-3 h-3 text-violet-400" />
                            {ref.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Legal Disclaimer */}
                    <div className="pt-2 text-[10px] text-slate-500 italic leading-relaxed border-t border-white/[0.04]">
                      {msg.structuredResponse.disclaimer}
                    </div>
                  </div>
                ) : (
                  !isUser && <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Assistant Message Actions */}
                {!isUser && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
                    <span className="text-slate-500 font-mono text-[10px]">
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
                      className="px-2.5 py-1 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-400 hover:text-white flex items-center gap-1 text-[10px] transition-colors"
                      title="Copy response to clipboard"
                    >
                      {copiedMessageId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Copied</span>
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
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center flex-shrink-0 animate-pulse shadow-violet-glow">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-obsidian-900 border border-white/[0.08] text-slate-300 text-xs flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
              <span>Analyzing technical evidence traces and statutory requirements...</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
            {copilotMode === 'backend' && (
              <button
                onClick={() => {
                  setCopilotMode('demo');
                  setErrorMessage(null);
                }}
                className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold border border-rose-500/40 flex-shrink-0"
              >
                Switch to Demo Mode
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Suggested Questions & Chat Input Area */}
      <div className="p-4 rounded-2xl bg-obsidian-900/85 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md space-y-3 flex-shrink-0">
        {/* Suggested Question Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 flex items-center gap-1 font-mono">
            <HelpCircle className="w-3 h-3 text-violet-400" />
            Suggested:
          </span>
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSendMessage(q)}
              className="px-3 py-1.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] hover:border-violet-500/40 text-slate-300 hover:text-white text-xs whitespace-nowrap transition-all flex-shrink-0 active:scale-95 disabled:opacity-50"
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
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-obsidian-950/80 border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20 resize-none max-h-24 disabled:opacity-50 font-sans"
            />
            <span className="absolute right-3 bottom-2.5 text-[10px] text-slate-500 font-mono select-none hidden sm:inline">
              ↵ to send
            </span>
          </div>

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="p-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white font-bold shadow-violet-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
