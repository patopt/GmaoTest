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
}

export interface EmailBatch {
  id: number;
  emails: EnrichedEmail[];
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface AppState {
  totalInboxCount: number;
  lastFetchedToken: string | null;
  processedCount: number;
}

declare global {
  interface Window {
    puter: any;
    google: any;
    gapi: any;
  }
}