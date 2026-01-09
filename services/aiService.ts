
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
 * Analyse ULTRA-PRÉCISE d'un seul email.
 * L'IA connaît les dossiers déjà utilisés pour assurer la cohérence.
 */
export const analyzeSingleEmail = async (email: EmailMessage, model: string, existingFolders: string[] = []): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    RÔLE : ARCHITECTE GMAIL SÉNIOR.
    MISSION : Analyser cet email spécifique pour un classement parfait.
    
    CONTEXTE DES DOSSIERS ACTUELS : ${existingFolders.length > 0 ? existingFolders.join(', ') : 'Aucun dossier encore créé'}
    REMARQUE : Si cet email appartient à un domaine déjà couvert par un dossier existant, réutilise STRICTEMENT le nom de ce dossier.

    EMAIL À TRAITER :
    De : ${email.from}
    Sujet : ${email.subject}
    Extrait : ${email.snippet}

    FORMAT DE RÉPONSE (JSON STRICT UNIQUEMENT) :
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "NOM DU DOSSIER",
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

    const result = JSON.parse(response.text);
    return result;
  } catch (err) {
    logger.error(`Erreur IA pour mail ID: ${email.id}`, err);
    throw err;
  }
};

/**
 * Orchestre l'analyse d'un batch de 15 en lançant des requêtes individuelles.
 */
export const analyzeWithGeminiSDK = async (emails: EmailMessage[], model: string, existingFolders: string[] = []): Promise<Record<string, AIAnalysis>> => {
  const results: Record<string, AIAnalysis> = {};
  
  // On traite 5 emails en parallèle à la fois pour respecter les quotas tout en étant rapide
  const CONCURRENCY = 5;
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const chunk = emails.slice(i, i + CONCURRENCY);
    const chunkPromises = chunk.map(async (email) => {
      try {
        const analysis = await analyzeSingleEmail(email, model, existingFolders);
        // On met à jour les dossiers existants localement pour le prochain email du batch
        if (!existingFolders.includes(analysis.suggestedFolder)) {
            existingFolders.push(analysis.suggestedFolder);
        }
        return { id: email.id, analysis };
      } catch (e) {
        return { id: email.id, analysis: null };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach(res => {
      if (res.analysis) results[res.id] = res.analysis;
    });
  }

  return results;
};

export const analyzeWithPuter = async (emails: EmailMessage[], model: string): Promise<Record<string, AIAnalysis>> => {
  // Puter.js n'aime pas trop les rafales, on reste sur un batch consolidé mais avec un prompt renforcé
  const prompt = `Analyse individuellement chaque email suivant et retourne un objet JSON (ID=Clé). Emails: ${JSON.stringify(emails)}`;
  try {
    const response = await window.puter.ai.chat(prompt, { model: model });
    return JSON.parse(cleanAIResponse(response));
  } catch (err) {
    logger.error("Erreur Puter AI", err);
    throw err;
  }
};

export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat("Dis OK", { model });
      return cleanAIResponse(resp).toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: "Dis OK" });
      return resp.text.toUpperCase().includes('OK');
    }
  } catch (err) { return false; }
};
