
export interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  subject?: string;
  from?: string;
  date?: string;
}

export interface AIAnalysis {
  category: string;
  tags: string[];
  suggestedFolder: string;
  summary: string;
  sentiment: 'Positif' | 'Neutre' | 'Négatif';
  action?: 'archive' | 'keep' | 'delete';
}

export interface EnrichedEmail extends EmailMessage {
  analysis?: AIAnalysis;
  processed?: boolean;
  organized?: boolean;
}

export type TaskStatus = 'pending' | 'running' | 'stopped' | 'completed' | 'error' | 'cooldown';

export interface HarvestTranche {
  id: number;
  startIndex: number;
  totalToFetch: number;
  fetchedCount: number;
  status: TaskStatus;
  emails: EnrichedEmail[];
  nextPageToken?: string | null;
}

// Added EmailBatch interface to resolve missing export error in components/BatchAccordion.tsx
export interface EmailBatch {
  id: number;
  emails: EnrichedEmail[];
}

declare global {
  interface Window {
    puter: any;
    google: any;
    gapi: any;
  }
}
