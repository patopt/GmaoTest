export const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash'
];

export const DEFAULT_AI_MODEL = 'gemini-3-flash-preview';

// Add AI_MODEL export to fix "Module has no exported member 'AI_MODEL'" errors
export const AI_MODEL = DEFAULT_AI_MODEL;

export const GMAIL_DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
];

// Scopes étendus pour permettre la modification des labels et le déplacement des messages
export const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify';

export const BATCH_SIZE = 15;