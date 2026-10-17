import { Finding, Severity } from '@/types';

export interface EvidenceReference {
  id: string;
  label: string;
  snippet?: string;
  sourceType: 'network_packet' | 'dom_script' | 'storage' | 'auth_probe';
}

export interface CopilotStructuredResponse {
  summary: string;
  whatWeObserved: string[];
  whyItMatters: string;
  whatRemainsUncertain: string;
  recommendedActions: string[];
  howToVerify: string[];
  evidenceReferences: EvidenceReference[];
  disclaimer: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  content: string;
  structuredResponse?: CopilotStructuredResponse;
  isDemoResponse?: boolean;
  suggestedNextQuestions?: string[];
}

export interface SanitizedFindingContext {
  findingId: string;
  title: string;
  severity: Severity;
  confidence: number;
  category: string;
  affectedUrl: string;
  endpoint: string;
  dpdpSection: string;
  isDemoFixture: boolean;
  observedEvidence: {
    method: string;
    url: string;
    initiatorScript?: string;
    sanitizedHeaders: Record<string, string>;
    sanitizedPayload: string;
    detectedFields: string[];
  };
  remediationSteps: string[];
  hasCodeDiff: boolean;
}

export type CopilotMode = 'demo' | 'backend';
