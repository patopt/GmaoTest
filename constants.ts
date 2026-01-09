
// Model selection based on GenAI guidelines for complex and basic text tasks
export const AI_MODEL = 'gemini-3-pro-preview';
export const DEFAULT_AI_MODEL = AI_MODEL;

export const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash-lite-latest',
  'gemini-2.5-pro-preview'
];

export const AI_PROVIDERS = [
  { id: 'puter', name: 'Puter.js (Gratuit / Sans Clé)', icon: 'zap' },
  { id: 'gemini-sdk', name: 'Gemini SDK (Configuration Interne)', icon: 'shield' }
];

export const DEFAULT_PROVIDER = 'puter';
export const GMAIL_DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'];
export const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels';
export const BATCH_SIZE = 15;

export const GOOGLE_CLIENT_ID = "392552451464-hf5mvvcs0tpdohr129u0glhb2m2p8q7v.apps.googleusercontent.com";