import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  Zap,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Clock,
  Users,
  Globe,
  BarChart3,
  Calendar,
  ArrowRight,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { api } from '@/services/api';
import { authService } from '@/services/authService';
import {
  SubscriptionOverview,
  PlanTier,
  PlanRecommendation,
  Organization
} from '@/types';

export const Subscription: React.FC = () => {
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Questionnaire Modal State
  const [showQuiz, setShowQuiz] = useState<boolean>(false);
  const [quizStep, setQuizStep] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<PlanRecommendation | null>(null);
  const [quizLoading, setQuizLoading] = useState<boolean>(false);

  const quizQuestions = [
    {
      id: 'domains',
      title: 'How many web applications or domains do you need to audit?',
      options: [
        { label: 'Single core domain (1 domain)', value: '1' },
        { label: 'A few business products / portals (2 - 5 domains)', value: '3' },
        { label: 'Large portfolio or enterprise ecosystem (6 - 25+ domains)', value: '10' }
      ]
    },
    {
      id: 'scans',
      title: 'How often do you plan to run automated compliance audits?',
      options: [
        { label: 'Occasional / Quarterly audits (~10 scans/month)', value: '10' },
        { label: 'Weekly CI/CD or post-deployment checks (~100 scans/month)', value: '50' },
        { label: 'Continuous daily scanning & multi-team workflows (500+ scans/month)', value: '250' }
      ]
    },
    {
      id: 'team_size',
      title: 'How many team members need access (DPOs, Auditors, Devs)?',
      options: [
        { label: 'Solo DPO or single privacy officer (1 member)', value: '1' },
        { label: 'Small privacy & engineering team (2 - 5 members)', value: '4' },
        { label: 'Cross-functional enterprise security team (6 - 20+ members)', value: '10' }
      ]
    },
    {
      id: 'retention',
      title: 'What audit log and evidence retention period is required?',
      options: [
        { label: '30 days standard evidence retention', value: '30' },
        { label: '90 days statutory compliance retention', value: '90' },
        { label: '365 days / 1 year audit trail for Board & Regulatory inspection', value: '365' }
      ]
    },
    {
      id: 'data_sensitivity',
      title: 'Do you process high-risk personal data (Children’s data, KYC, Health)?',
      options: [
        { label: 'Standard business & user contact data', value: 'standard' },
        { label: 'KYC, Financial information, or Children’s personal data', value: 'children_data' },
        { label: 'Designated Significant Data Fiduciary (SDF) or heavy fintech/healthcare', value: 'significant_data_fiduciary' }
      ]
    }
  ];

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
      const [orgs, planList] = await Promise.all([
        api.getOrganizations(),
        api.getPlans()
      ]);
      setPlans(planList);

      if (orgs.length > 0) {
        const activeOrg = orgs[0];
        setCurrentOrg(activeOrg);
        const sub = await api.getSubscription(activeOrg.id);
        setSubscription(sub);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (planId: 'starter' | 'growth' | 'business') => {
    if (!currentOrg) return;
    if (subscription?.plan.id === planId) return;

    setActionLoading(planId);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.changePlan(currentOrg.id, planId);
      setSubscription(updated);
      setSuccessMsg(`Successfully switched subscription to the ${updated.plan.name} plan.`);
      if (showQuiz) setShowQuiz(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update subscription');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAnswerQuestion = (val: string) => {
    const qId = quizQuestions[quizStep].id;
    const nextAnswers = { ...quizAnswers, [qId]: val };
    setQuizAnswers(nextAnswers);

    if (quizStep + 1 < quizQuestions.length) {
      setQuizStep(prev => prev + 1);
    } else {
      // Completed questionnaire -> submit to recommendation engine
      submitQuiz(nextAnswers);
    }
  };

  const submitQuiz = async (answers: Record<string, string>) => {
    setQuizLoading(true);
    setError(null);
    try {
      const rec = await api.recommendPlan(answers);
      setRecommendation(rec);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate recommendation');
    } finally {
      setQuizLoading(false);
    }
  };

  const resetQuiz = () => {
    setQuizStep(0);
    setQuizAnswers({});
    setRecommendation(null);
    setShowQuiz(false);
  };

  if (!authService.isAuthenticated()) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <CreditCard className="w-12 h-12 text-teal-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            Subscription and plan management are accessible for registered organizations. Please sign in to manage your tier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Subscription & Quota Management</h1>
            {currentOrg && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {currentOrg.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Manage your organization's DPDP audit entitlements, website allowances, and subscription tier.
          </p>
        </div>

        <button
          onClick={() => {
            setShowQuiz(true);
            setQuizStep(0);
            setRecommendation(null);
            setQuizAnswers({});
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-500/10"
        >
          <Sparkles className="w-4 h-4" />
          Help Me Choose a Plan
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Active Subscription Overview Card */}
      {subscription && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                  Active Plan
                </span>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                  subscription.status === 'active' ? 'bg-teal-500/10 text-teal-300' : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {subscription.status.toUpperCase()}
                </span>
              </div>
              <h2 className="text-3xl font-extrabold text-white mt-1">
                {subscription.plan.name} Plan
              </h2>
              <p className="text-sm text-slate-400 mt-1 max-w-lg">
                {subscription.plan.tagline}
              </p>
            </div>

            <div className="flex items-center gap-6 text-xs text-slate-400">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 min-w-[160px]">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Current Billing Period</span>
                </div>
                <div className="text-slate-200 font-medium">
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} – {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Usage Meters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            {/* Scans Quota */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-teal-400" />
                  Monthly Scans
                </span>
                <span className="text-xs font-bold text-white">
                  {subscription.scansUsed} / {subscription.scansLimit}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (subscription.scansUsed / subscription.scansLimit) >= 0.9
                      ? 'bg-rose-500'
                      : (subscription.scansUsed / subscription.scansLimit) >= 0.7
                      ? 'bg-amber-500'
                      : 'bg-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.round((subscription.scansUsed / subscription.scansLimit) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                {subscription.scansRemaining} scans remaining this cycle
              </span>
            </div>

            {/* Websites Quota */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Verified Domains
                </span>
                <span className="text-xs font-bold text-white">
                  {subscription.websitesCount} / {subscription.websitesLimit}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((subscription.websitesCount / subscription.websitesLimit) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                {Math.max(0, subscription.websitesLimit - subscription.websitesCount)} domain slots available
              </span>
            </div>

            {/* Members Quota */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  Team Seats
                </span>
                <span className="text-xs font-bold text-white">
                  {subscription.membersCount} / {subscription.membersLimit}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((subscription.membersCount / subscription.membersLimit) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                {subscription.dataRetentionDays} days statutory audit log retention
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Plan Tiers Grid */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Available Plans</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Transparent SaaS pricing in Indian Rupees (INR) designed for DPDP Act 2023 compliance.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 self-start">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                billingCycle === 'monthly' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                billingCycle === 'annual' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Annual
              <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => {
            const isCurrent = subscription?.plan.id === plan.id;
            const monthlyBase = plan.priceInrMonth || plan.priceInrMonthly || 0;
            const annualTotal = plan.priceInrAnnual || Math.round(monthlyBase * 12 * 0.8);
            const price = billingCycle === 'annual'
              ? (plan.priceInrAnnualMonthlyEquivalent || Math.round(annualTotal / 12))
              : monthlyBase;

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all relative ${
                  plan.isPopular
                    ? 'bg-slate-900 border-2 border-teal-500/80 shadow-xl shadow-teal-500/5'
                    : 'bg-slate-900 border border-slate-800'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow">
                    Most Popular
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{plan.tagline}</p>

                  <div className="mt-5 mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-white">
                        ₹{price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">/ month</span>
                    </div>
                    {billingCycle === 'annual' && (
                      <span className="text-[11px] text-teal-400 block mt-0.5 font-medium">
                        Billed annually (₹{annualTotal.toLocaleString('en-IN')}/yr)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-slate-800/80 pt-6 mb-8 text-xs text-slate-300">
                    <div className="flex items-center gap-2.5 font-medium">
                      <Globe className="w-4 h-4 text-teal-400 shrink-0" />
                      <span><strong>{plan.maxWebsites}</strong> Verified Domain{plan.maxWebsites > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-medium">
                      <BarChart3 className="w-4 h-4 text-teal-400 shrink-0" />
                      <span><strong>{plan.scansPerMonth}</strong> Audits / Month</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-medium">
                      <Users className="w-4 h-4 text-teal-400 shrink-0" />
                      <span><strong>{plan.maxMembers}</strong> Team Member{plan.maxMembers > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-medium">
                      <Clock className="w-4 h-4 text-teal-400 shrink-0" />
                      <span><strong>{plan.dataRetentionDays || 30} Days</strong> Audit Retention</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/40 space-y-2 text-slate-400 text-[11px]">
                      {plan.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 cursor-default flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 text-teal-400" />
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={actionLoading === plan.id}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        plan.isPopular
                          ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/10'
                          : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                      }`}
                    >
                      {actionLoading === plan.id && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      Switch to {plan.name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Questionnaire Modal */}
      {showQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-bold text-white">Plan Recommendation Engine</h3>
              </div>
              <button onClick={resetQuiz} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            {recommendation ? (
              <div className="space-y-6">
                <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-5 text-center">
                  <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider block mb-1">
                    Recommended Tier For Your Workload
                  </span>
                  <h4 className="text-2xl font-black text-white">
                    {recommendation.recommendedPlanName} Plan
                  </h4>
                  <p className="text-xs text-slate-300 mt-2 max-w-md mx-auto">
                    {recommendation.summary}
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">
                    Transparent Reasoning:
                  </span>
                  {recommendation.reasoning.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setRecommendation(null);
                      setQuizStep(0);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Retake Quiz
                  </button>
                  <button
                    onClick={() => handlePlanChange(recommendation.recommendedPlan)}
                    disabled={actionLoading === recommendation.recommendedPlan}
                    className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/10"
                  >
                    {actionLoading === recommendation.recommendedPlan && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Select {recommendation.recommendedPlanName} Plan
                  </button>
                </div>
              </div>
            ) : quizLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mb-3" />
                <span className="text-sm">Calculating deterministic recommendation based on DPDP compliance requirements...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Question {quizStep + 1} of {quizQuestions.length}</span>
                    <span>{Math.round(((quizStep) / quizQuestions.length) * 100)}% Complete</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-6">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(((quizStep + 1) / quizQuestions.length) * 100)}%` }}
                    />
                  </div>
                  <h4 className="text-base font-semibold text-white">
                    {quizQuestions[quizStep].title}
                  </h4>
                </div>

                <div className="space-y-3">
                  {quizQuestions[quizStep].options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswerQuestion(opt.value)}
                      className="w-full p-4 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-teal-500/60 hover:bg-slate-800/80 text-left transition-all flex items-center justify-between group"
                    >
                      <span className="text-sm text-slate-200 group-hover:text-white font-medium">
                        {opt.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
                  {quizStep > 0 ? (
                    <button
                      onClick={() => setQuizStep(prev => prev - 1)}
                      className="text-slate-400 hover:text-white"
                    >
                      ← Back
                    </button>
                  ) : <div />}
                  <button onClick={resetQuiz} className="text-slate-500 hover:text-slate-400">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
