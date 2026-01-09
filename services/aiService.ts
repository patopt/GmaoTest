
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

export const analyzeWithGeminiSDK = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Tu es un expert en tri Gmail. Analyse CHAQUE email individuellement dans cette liste.
    Pour chaque email (ID), tu DOIS générer une analyse unique.
    
    Retourne UN SEUL objet JSON où les clés sont les IDs des emails.
    Format par email:
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "Nom du dossier (ex: Factures, Projets...)",
      "summary": "Résumé en 5 mots max",
      "sentiment": "Positif|Neutre|Négatif"
    }

    Emails à traiter: ${JSON.stringify(emails.map(e => ({ id: e.id, sub: e.subject, from: e.from, snip: e.snippet })))}
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        temperature: 0.2 // Plus bas pour plus de précision factuelle
      }
    });
    return JSON.parse(response.text);
  } catch (err) {
    logger.error("Erreur Gemini SDK", err);
    throw err;
  }
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  const prompt = `Analyse ces emails Gmail individuellement et retourne un objet JSON (clé=ID). Format: {"id": {"category": "...", "tags": [], "suggestedFolder": "...", "summary": "...", "sentiment": "..."}}. Données: ${JSON.stringify(emails.map(e => ({ id: e.id, sub: e.subject, from: e.from, snip: e.snippet })))}`;
  
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
