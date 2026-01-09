export const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro-preview', // Nouveau modèle demandé
  'gemini-2.5-flash-lite'
];

export const AI_PROVIDERS = [
  { id: 'puter', name: 'Puter.js (Gratuit / No Key)', icon: 'zap' },
  { id: 'gemini-sdk', name: 'Gemini SDK (Clé API requise)', icon: 'shield' }
];

export const DEFAULT_AI_MODEL = 'gemini-2.5-pro-preview';
export const AI_MODEL = DEFAULT_AI_MODEL;
export const DEFAULT_PROVIDER = 'puter';
export const GMAIL_DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'];
export const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels';
export const BATCH_SIZE = 15;
export const MAX_HARVEST_LIMIT = 20000; 

export const GOOGLE_CLIENT_ID = "392552451464-hf5mvvcs0tpdohr129u0glhb2m2p8q7v.apps.googleusercontent.com";
