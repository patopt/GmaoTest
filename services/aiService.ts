
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

/**
 * Analyse un SEUL email avec une précision maximale.
 */
export const analyzeSingleEmail = async (email: EmailMessage, model: string, existingFolders: string[] = []): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    MISSION : Tu es un expert en archivage Gmail. Analyse cet email précis.
    
    CONTEXTE DES DOSSIERS EXISTANTS : ${existingFolders.join(', ') || 'Aucun pour le moment'}
    (Utilise ces noms si l'email appartient à une catégorie déjà existante pour garder une boîte cohérente).

    DÉTAILS DE L'EMAIL :
    Expéditeur : ${email.from}
    Sujet : ${email.subject}
    Contenu : ${email.snippet}

    TU DOIS RÉPONDRE UNIQUEMENT EN JSON AVEC CE FORMAT :
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "NOM DU DOSSIER (SOIS COHÉRENT AVEC LE CONTEXTE SI POSSIBLE)",
      "summary": "Résumé de 5 mots max",
      "sentiment": "Positif|Neutre|Négatif"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    return JSON.parse(response.text);
  } catch (err) {
    logger.error(`Échec de l'analyse individuelle pour ${email.id}`, err);
    throw err;
  }
};

/**
 * Analyse un groupe d'emails en lançant des requêtes individuelles en parallèle.
 */
export const analyzeWithGeminiSDK = async (emails: EmailMessage[], model: string, existingFolders: string[] = []): Promise<Record<string, AIAnalysis>> => {
  const results: Record<string, AIAnalysis> = {};
  
  // On traite par petits lots de 3 en parallèle pour ne pas saturer l'API tout en allant vite
  const CONCURRENCY = 3;
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const chunk = emails.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (email) => {
      try {
        const analysis = await analyzeSingleEmail(email, model, existingFolders);
        return { id: email.id, analysis };
      } catch (e) {
        return { id: email.id, analysis: null };
      }
    }));

    chunkResults.forEach(res => {
      if (res.analysis) results[res.id] = res.analysis;
    });
  }

  return results;
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  // Puter ne supporte pas bien les rafales de requêtes, on garde le batch pour lui mais avec un prompt renforcé
  const prompt = `Analyse individuellement chaque email et retourne un JSON indexé par ID. Format par email: {"category": "...", "tags": [], "suggestedFolder": "...", "summary": "...", "sentiment": "..."}. Emails: ${JSON.stringify(emails)}`;
  try {
    const response = await window.puter.ai.chat(prompt, { model: model });
    return JSON.parse(cleanAIResponse(response));
  } catch (err) {
    logger.error("Erreur Puter", err);
    throw err;
  }
};

export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat("Dis 'OK'", { model });
      return cleanAIResponse(resp).toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: "Dis 'OK'" });
      return resp.text.toUpperCase().includes('OK');
    }
  } catch (err) { return false; }
};
