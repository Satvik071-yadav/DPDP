import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Plus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  FileCode,
  Layers,
  ArrowRight,
  Shield
} from 'lucide-react';
import { api } from '@/services/api';
import { authService } from '@/services/authService';
import { Website, Organization, SubscriptionOverview } from '@/types';

export const Domains: React.FC = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionOverview | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Add Domain Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newHostname, setNewHostname] = useState<string>('');
  const [newMethod, setNewMethod] = useState<'dns_txt' | 'http_file'>('dns_txt');
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Verification Instructions Modal
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string; diagnostic?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Delete Domain State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authService.isAuthenticated()) {
        setLoading(false);
        return;
      }
      const orgs = await api.getOrganizations();
      setOrganizations(orgs);
      if (orgs.length > 0) {
        const activeOrg = orgs[0];
        setCurrentOrg(activeOrg);
        const [sites, sub] = await Promise.all([
          api.getWebsites(activeOrg.id),
          api.getSubscription(activeOrg.id).catch(() => null)
        ]);
        setWebsites(sites);
        setSubscription(sub);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load domain information');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const created = await api.createWebsite(currentOrg.id, newHostname.trim(), newMethod);
      setWebsites(prev => [created, ...prev]);
      setShowAddModal(false);
      setNewHostname('');
      // Open verification modal immediately for convenience
      setSelectedWebsite(created);
      // Reload subscription usage
      api.getSubscription(currentOrg.id).then(setSubscription).catch(() => {});
    } catch (err: any) {
      setAddError(err.message || 'Failed to register domain');
    } finally {
      setAddLoading(false);
    }
  };

  const handleVerify = async (website: Website) => {
    if (!currentOrg) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await api.verifyWebsite(currentOrg.id, website.id);
      setVerifyResult(result);
      if (result.success) {
        // Update website in local list
        setWebsites(prev => prev.map(w => w.id === website.id ? { ...w, verificationStatus: 'verified', verifiedAt: result.verifiedAt } : w));
        if (selectedWebsite?.id === website.id) {
          setSelectedWebsite(prev => prev ? { ...prev, verificationStatus: 'verified', verifiedAt: result.verifiedAt } : null);
        }
      }
    } catch (err: any) {
      setVerifyResult({
        success: false,
        message: err.message || 'Verification probe encountered an error.'
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleRegenerateToken = async (website: Website) => {
    if (!currentOrg) return;
    try {
      const updated = await api.regenerateWebsiteToken(currentOrg.id, website.id);
      setWebsites(prev => prev.map(w => w.id === website.id ? updated : w));
      setSelectedWebsite(updated);
      setVerifyResult({
        success: false,
        message: 'A fresh challenge token was generated. Previous tokens are invalidated.'
      });
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate token');
    }
  };

  const handleDelete = async (websiteId: string) => {
    if (!currentOrg) return;
    if (!confirm('Are you sure you want to remove this website from your organization? Associated scan records will be preserved.')) {
      return;
    }
    setDeletingId(websiteId);
    try {
      await api.deleteWebsite(currentOrg.id, websiteId);
      setWebsites(prev => prev.filter(w => w.id !== websiteId));
      if (selectedWebsite?.id === websiteId) {
        setSelectedWebsite(null);
      }
      api.getSubscription(currentOrg.id).then(setSubscription).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to delete website');
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!authService.isAuthenticated()) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <Globe className="w-12 h-12 text-teal-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            Domain management and ownership verification are enterprise multi-tenant capabilities. Sign in to register and verify your organization's websites.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Domain Management</h1>
            {currentOrg && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {currentOrg.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Register and prove ownership of your organization's domains via DNS TXT or HTTP challenge to authorize privacy audits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {subscription && (
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-2 text-right">
              <span className="text-xs text-slate-400 block">Domain Quota</span>
              <span className="text-sm font-semibold text-white">
                {subscription.websitesCount} / {subscription.websitesLimit} Domains
              </span>
            </div>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-teal-500/10"
          >
            <Plus className="w-4 h-4" />
            Add Domain
          </button>
        </div>
      </div>

      {/* Security Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
        <Shield className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">DPDP Act 2023 Statutory Verification Guardrail:</span>
          <p>
            To prevent unauthorized scanning against arbitrary web services, real live browser compliance audits require verified domain ownership.
            Tokens are cryptographically hashed with SHA-256 and expire in 72 hours.
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
          <button onClick={loadData} className="text-xs underline hover:text-white">Retry</button>
        </div>
      )}

      {/* Website List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-teal-400 mb-2" />
          <span>Loading organization domains...</span>
        </div>
      ) : websites.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center">
          <Globe className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-1">No domains registered yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Add your company's domain or public web application to start conducting DPDP compliance and privacy audits.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Register Your First Domain
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {websites.map(website => {
            const isVerified = website.verificationStatus === 'verified';
            return (
              <div
                key={website.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl ${isVerified ? 'bg-teal-500/10 text-teal-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-base truncate max-w-[180px]">
                          {website.hostname}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {website.verificationMethod === 'dns_txt' ? 'DNS TXT Record' : 'HTTP Challenge File'}
                        </span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 ${
                      isVerified
                        ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                        : website.verificationStatus === 'failed'
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}>
                      {isVerified ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verified
                        </>
                      ) : website.verificationStatus === 'failed' ? (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Failed
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </>
                      )}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-400 border-t border-slate-800/80 pt-4 mb-6">
                    <div className="flex justify-between">
                      <span>Registered:</span>
                      <span className="text-slate-300">
                        {new Date(website.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {isVerified && website.verifiedAt && (
                      <div className="flex justify-between">
                        <span>Verified At:</span>
                        <span className="text-teal-400">
                          {new Date(website.verifiedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {website.lastScannedAt && (
                      <div className="flex justify-between">
                        <span>Last Audit:</span>
                        <span className="text-slate-300">
                          {new Date(website.lastScannedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  {isVerified ? (
                    <button
                      onClick={() => navigate(`/scan?domain=${encodeURIComponent(website.hostname)}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-xl text-xs font-semibold transition-colors border border-teal-500/20"
                    >
                      Audit Domain
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedWebsite(website);
                        setVerifyResult(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold transition-colors border border-amber-500/20"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verify Setup
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(website.id)}
                    disabled={deletingId === website.id}
                    title="Remove domain"
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Domain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1">Add Domain</h3>
            <p className="text-xs text-slate-400 mb-6">
              Enter the domain you wish to audit. You will verify ownership before scanning.
            </p>

            {addError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Domain / Hostname
                </label>
                <input
                  type="text"
                  placeholder="e.g. app.mycompany.in or mybrand.com"
                  value={newHostname}
                  onChange={e => setNewHostname(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Do not include https:// or trailing slashes.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Verification Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMethod('dns_txt')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newMethod === 'dns_txt'
                        ? 'border-teal-500 bg-teal-500/10 text-white'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-semibold block text-teal-400">DNS TXT Record</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">Recommended for root/subdomains</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewMethod('http_file')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newMethod === 'http_file'
                        ? 'border-teal-500 bg-teal-500/10 text-white'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-semibold block text-teal-400">HTTP File Challenge</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">Upload to .well-known path</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading || !newHostname.trim()}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {addLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Register Domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verification Instructions Modal */}
      {selectedWebsite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Verify Domain Ownership</h3>
                  <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                    selectedWebsite.verificationStatus === 'verified'
                      ? 'bg-teal-500/10 text-teal-300'
                      : 'bg-amber-500/10 text-amber-300'
                  }`}>
                    {selectedWebsite.verificationStatus.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {selectedWebsite.hostname}
                </p>
              </div>
              <button
                onClick={() => setSelectedWebsite(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Diagnostic Alert if check was run */}
            {verifyResult && (
              <div className={`mb-6 p-4 rounded-xl border text-xs space-y-1 ${
                verifyResult.success
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {verifyResult.success ? <ShieldCheck className="w-4 h-4 text-teal-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                  <span>{verifyResult.message}</span>
                </div>
                {verifyResult.diagnostic && (
                  <p className="text-slate-400 font-mono text-[11px] pl-6 pt-1">
                    Probe detail: {verifyResult.diagnostic}
                  </p>
                )}
              </div>
            )}

            {/* Instructions */}
            {selectedWebsite.verificationMethod === 'dns_txt' ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Add a <strong>TXT record</strong> to your DNS provider (Cloudflare, Route53, GoDaddy, etc.) with the following attributes:
                </p>

                <div className="space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Host / Name</span>
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200">
                      <span>{selectedWebsite.dnsTxtHost || `@ or ${selectedWebsite.hostname}`}</span>
                      <button
                        onClick={() => copyToClipboard(selectedWebsite.dnsTxtHost || selectedWebsite.hostname, 'host')}
                        className="text-slate-400 hover:text-teal-400 transition-colors"
                      >
                        {copiedField === 'host' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Record Type</span>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200">
                      TXT
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">TXT Value</span>
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-400 break-all">
                      <span>{selectedWebsite.dnsTxtExpectedValue || selectedWebsite.verificationToken || 'dpdp-verify-token'}</span>
                      <button
                        onClick={() => copyToClipboard(selectedWebsite.dnsTxtExpectedValue || selectedWebsite.verificationToken || '', 'token')}
                        className="text-slate-400 hover:text-teal-400 transition-colors shrink-0 ml-2"
                      >
                        {copiedField === 'token' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Upload a plain text file accessible via public HTTPS at:
                </p>

                <div className="space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Required URL Path</span>
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200">
                      <span>https://{selectedWebsite.hostname}{selectedWebsite.httpFilePath || '/.well-known/dpdp-challenge.txt'}</span>
                      <button
                        onClick={() => copyToClipboard(`https://${selectedWebsite.hostname}${selectedWebsite.httpFilePath || '/.well-known/dpdp-challenge.txt'}`, 'url')}
                        className="text-slate-400 hover:text-teal-400 transition-colors"
                      >
                        {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Expected File Content (text/plain)</span>
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-400 break-all">
                      <span>{selectedWebsite.httpExpectedContent || selectedWebsite.verificationToken || 'dpdp-verify-token'}</span>
                      <button
                        onClick={() => copyToClipboard(selectedWebsite.httpExpectedContent || selectedWebsite.verificationToken || '', 'content')}
                        className="text-slate-400 hover:text-teal-400 transition-colors shrink-0 ml-2"
                      >
                        {copiedField === 'content' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Token Expiry Info */}
            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>Token Validity: 72 hours from generation</span>
              <button
                type="button"
                onClick={() => handleRegenerateToken(selectedWebsite)}
                className="text-teal-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate Token
              </button>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedWebsite(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleVerify(selectedWebsite)}
                disabled={verifyLoading}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-500/10"
              >
                {verifyLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {verifyLoading ? 'Probing Target...' : 'Verify Ownership Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
