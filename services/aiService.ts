
import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const cleanAIResponse = (text: any): string => {
  let raw = typeof text === 'object' ? (text.text || JSON.stringify(text)) : text;
  let clean = raw.trim();
  if (clean.includes('```')) {
    clean = clean.replace(/```json|```/g, '').trim();
  }
  return clean;
};

// apiKey param removed to comply with exclusive process.env.API_KEY rule
export const analyzeWithGeminiSDK = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Tu es un expert Gmail. Analyse ces emails et retourne un objet JSON (clé=ID). Format: {"id": {"category": "...", "tags": [], "suggestedFolder": "...", "summary": "...", "sentiment": "..."}}. Emails: ${JSON.stringify(emails)}`;
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text);
  } catch (err) {
    logger.error("Erreur Gemini SDK", err);
    throw err;
  }
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  const prompt = `Analyse ces emails Gmail et retourne un objet JSON (clé=ID). Format: {"id": {"category": "...", "tags": [], "suggestedFolder": "...", "summary": "...", "sentiment": "..."}}. Données: ${JSON.stringify(emails)}`;
  
  if (!window.puter) throw new Error("Puter.js non chargé.");
  
  try {
    const response = await window.puter.ai.chat(prompt, { model: model });
    const clean = cleanAIResponse(response);
    return JSON.parse(clean);
  } catch (err) {
    logger.error("Erreur Puter.ai", err);
    throw err;
  }
};

// apiKey param removed; uses process.env.API_KEY directly
export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  const prompt = "Répond uniquement le mot 'OK' sans ponctuation.";
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat(prompt, { model });
      const text = cleanAIResponse(resp);
      return text.toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: prompt });
      return resp.text.toUpperCase().includes('OK');
    }
  } catch (err) {
    return false;
  }
};