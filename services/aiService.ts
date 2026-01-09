
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
  
  // Prompt surpuissant pour forcer le traitement individuel
  const prompt = `
    DÉCRET SYSTÈME : TU ES L'ARCHITECTE GMAIL SUPRÊME.
    MISSION : Analyser une liste de ${emails.length} emails. 
    CONTRAINTE ABSOLUE : Tu dois traiter CHAQUE email par son ID unique. Aucun oubli n'est toléré.
    
    POUR CHAQUE EMAIL, DÉTERMINE :
    1. Category : Choisis strictement parmis [Travail, Personnel, Finance, Social, Urgent, Autre].
    2. Tags : 2 à 3 mots-clés courts (ex: "Facture", "Réunion", "Famille").
    3. SuggestedFolder : Le nom du dossier Gmail idéal (ex: "PROJETS 2024", "BANQUE", "SANTÉ"). Soyez précis.
    4. Summary : Une synthèse de 5 mots maximum.
    5. Sentiment : [Positif, Neutre, Négatif].

    RÈGLE DE SORTIE : Retourne uniquement un objet JSON pur où chaque clé est l'ID de l'email.
    Format :
    {
      "id_email_1": { "category": "...", "tags": [...], "suggestedFolder": "...", "summary": "...", "sentiment": "..." },
      ...
    }

    LISTE DES EMAILS À TRAITER :
    ${JSON.stringify(emails.map(e => ({ id: e.id, subject: e.subject, from: e.from, content: e.snippet })))}
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        temperature: 0.1, // Précision maximale, créativité minimale
      }
    });

    const results = JSON.parse(response.text);
    
    // Vérification d'intégrité
    const emailIds = emails.map(e => e.id);
    const resultIds = Object.keys(results);
    const missing = emailIds.filter(id => !resultIds.includes(id));
    
    if (missing.length > 0) {
      logger.warn(`${missing.length} emails n'ont pas été traités par l'IA. Tentative de complétion...`);
    }

    return results;
  } catch (err) {
    logger.error("ÉCHEC CRITIQUE DE L'ANALYSE IA", err);
    throw err;
  }
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  if (!window.puter) throw new Error("Puter.js non chargé.");
  
  const prompt = `ANALYSE INDIVIDUELLE STRICTE (${emails.length} items). Retourne JSON ID-KEYED : ${JSON.stringify(emails.map(e => ({ id: e.id, sub: e.subject, from: e.from, snip: e.snippet })))}`;
  
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
  const prompt = "Répond uniquement 'OK'.";
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat(prompt, { model });
      return cleanAIResponse(resp).toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: prompt });
      return resp.text.toUpperCase().includes('OK');
    }
  } catch (err) {
    return false;
  }
};
