import { Finding } from '@/types';
import { 
  CopilotMessage, 
  CopilotStructuredResponse, 
  SanitizedFindingContext, 
  CopilotMode 
} from '@/types/copilot';
import { 
  DETERMINISTIC_COPILOT_RESPONSES, 
  generateDynamicCopilotResponse 
} from '@/data/copilotFixtures';

import { getApiBaseUrl } from '@/services/apiConfig';
import { authService } from '@/services/authService';

export const copilotService = {
  /**
   * Builds an evidence-grounded sanitized context object from the application data model.
   * Redacts sensitive authorization tokens, cookies, passwords, and raw personal identifiers.
   */
  buildSanitizedContext(finding: Finding): SanitizedFindingContext {
    // Redact headers
    const sanitizedHeaders: Record<string, string> = {};
    if (finding.observedEvidence.requestHeaders) {
      for (const [k, v] of Object.entries(finding.observedEvidence.requestHeaders)) {
        if (/authorization|cookie|token|secret|key/i.test(k)) {
          sanitizedHeaders[k] = '[REDACTED_CREDENTIAL]';
        } else {
          sanitizedHeaders[k] = v;
        }
      }
    }

    // Sanitize payload: mask any 12 digit numbers or phone numbers
    let sanitizedPayload = finding.observedEvidence.sanitizedPayload || '';
    sanitizedPayload = sanitizedPayload
      .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, 'XXXX-XXXX-XXXX')
      .replace(/\+?91[\s-]?\d{10}\b/g, '+91 XXXXX XXXXX')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT_TOKEN]');

    return {
      findingId: finding.id,
      title: finding.title,
      severity: finding.severity,
      confidence: finding.confidence,
      category: finding.category,
      affectedUrl: finding.affectedUrl,
      endpoint: finding.endpoint,
      dpdpSection: finding.dpdpSection,
      isDemoFixture: true,
      observedEvidence: {
        method: finding.observedEvidence.method,
        url: finding.observedEvidence.url,
        initiatorScript: finding.observedEvidence.initiatorScript,
        sanitizedHeaders,
        sanitizedPayload,
        detectedFields: finding.observedEvidence.detectedFields || [],
      },
      remediationSteps: finding.remediationSteps || [],
      hasCodeDiff: Boolean(finding.codeDiff),
    };
  },

  /**
   * Matches user prompt against standard suggested question keys.
   */
  matchQuestionKey(prompt: string): string | null {
    const p = prompt.toLowerCase().trim();
    if (p.includes('simple') || p.includes('explain')) return 'explain_simple';
    if (p.includes('evidence') || p.includes('support')) return 'evidence_support';
    if (p.includes('not fixed') || p.includes('could happen') || p.includes('unresolved')) return 'what_happens_not_fixed';
    if (p.includes('developer') || p.includes('how to fix') || p.includes('how should a developer')) return 'how_developer_fix';
    if (p.includes('verify') || p.includes('verification')) return 'how_verify_fix';
    if (p.includes('business') || p.includes('owner') || p.includes('next steps')) return 'what_business_owner_do';
    return null;
  },

  /**
   * Send chat message through either deterministic demo mode or live FastAPI backend.
   */
  async sendMessage(params: {
    messages: CopilotMessage[];
    finding: Finding;
    mode: CopilotMode;
  }): Promise<CopilotMessage> {
    const { messages, finding, mode } = params;
    const lastUserMsg = messages[messages.length - 1];
    const sanitizedContext = this.buildSanitizedContext(finding);

    if (mode === 'demo') {
      // Realistic simulation delay (600 - 900ms)
      await new Promise((resolve) => setTimeout(resolve, 750));

      const matchedKey = this.matchQuestionKey(lastUserMsg.content);
      let structured: CopilotStructuredResponse;

      if (matchedKey && DETERMINISTIC_COPILOT_RESPONSES[finding.id]?.[matchedKey]) {
        structured = DETERMINISTIC_COPILOT_RESPONSES[finding.id][matchedKey];
      } else {
        structured = generateDynamicCopilotResponse(sanitizedContext, lastUserMsg.content);
      }

      // Next suggestions
      const allQuestions = [
        'Explain this finding in simple language.',
        'What evidence supports this finding?',
        'What could happen if this issue is not fixed?',
        'How should a developer fix it?',
        'How can I verify the fix?',
        'What should a business owner do next?',
      ];
      const suggestedNextQuestions = allQuestions
        .filter((q) => q.toLowerCase() !== lastUserMsg.content.toLowerCase())
        .slice(0, 3);

      return {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: structured.summary,
        structuredResponse: structured,
        isDemoResponse: true,
        suggestedNextQuestions,
      };
    }

    // Real AI mode: call FastAPI backend
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          findingContext: sanitizedContext,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend Copilot API returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.summary || data.content,
        structuredResponse: data.structuredResponse || {
          summary: data.summary || data.content,
          whatWeObserved: data.whatWeObserved || [],
          whyItMatters: data.whyItMatters || '',
          whatRemainsUncertain: data.whatRemainsUncertain || '',
          recommendedActions: data.recommendedActions || [],
          howToVerify: data.howToVerify || [],
          evidenceReferences: data.evidenceReferences || [],
          disclaimer: 'Generated by backend AI model grounded in provided finding context.',
        },
        isDemoResponse: false,
      };
    } catch (err: any) {
      throw new Error(
        `FastAPI backend Copilot endpoint unavailable at ${baseUrl}/api/v1/copilot/chat (${err.message || 'Network error'}). You can switch to Demo Mode to test with deterministic grounded fixtures.`
      );
    }
  },
};
