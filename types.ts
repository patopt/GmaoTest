export interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload?: {
    headers: { name: string; value: string }[];
    body?: { data?: string };
  };
  subject?: string;
  from?: string;
  date?: string;
}

export interface AIAnalysis {
  category: 'Travail' | 'Personnel' | 'Finance' | 'Promotions' | 'Social' | 'Urgent' | 'Autre';
  tags: string[];
  suggestedFolder: string;
  summary: string;
  sentiment: 'Positif' | 'Neutre' | 'Négatif';
}

export interface EnrichedEmail extends EmailMessage {
  analysis?: AIAnalysis;
}

// Puter.js Global Types
export interface PuterChatResponse {
  text: string;
  [key: string]: any;
}

export interface PuterAI {
  chat: (
    prompt: string,
    options?: { model: string; stream?: boolean }
  ) => Promise<PuterChatResponse>;
}

declare global {
  interface Window {
    puter: {
      ai: PuterAI;
      print: (msg: any) => void;
    };
    google: any;
    gapi: any;
  }
}
