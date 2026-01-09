import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const cleanAIResponse = (text: string): string => {
  let clean = text.trim();
  if (clean.includes('```')) {
    clean = clean.replace(/```json|```/g, '').trim();
  }
  return clean;
};

export const analyzeWithGeminiSDK = async (emails: EmailMessage[], model: string, apiKey: string): Promise<Record<string, AIAnalysis>> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  const prompt = `Analyse ces emails et retourne UNIQUEMENT un objet JSON (ID en clé) : ${JSON.stringify(emails)}`;
  
  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  
  return JSON.parse(response.text);
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  const prompt = `Tu es un expert Gmail. Analyse ces emails et retourne un objet JSON (clé=ID). Format: {"id": {"category": "...", "tags": [], "suggestedFolder": "...", "summary": "...", "sentiment": "..."}}. Emails: ${JSON.stringify(emails)}`;
  
  if (!window.puter) throw new Error("Puter.js non chargé.");
  
  const response = await window.puter.ai.chat(prompt, { model: model });
  const clean = cleanAIResponse(response.text);
  return JSON.parse(clean);
};

export const testAIConnection = async (provider: string, model: string, apiKey: string): Promise<boolean> => {
  const prompt = "Répond uniquement 'ok'.";
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat(prompt, { model });
      return resp.text.toLowerCase().includes('ok');
    } else {
      const actualKey = apiKey || process.env.API_KEY || '';
      if (!actualKey) return false;
      const ai = new GoogleGenAI({ apiKey: actualKey });
      const resp = await ai.models.generateContent({ model, contents: prompt });
      return resp.text.toLowerCase().includes('ok');
    }
  } catch (err) {
    logger.error("Test IA échoué", err);
    return false;
  }
};
