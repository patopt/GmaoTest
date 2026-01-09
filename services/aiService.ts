
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
 * PROMPT TITAN : Analyse ultra-précise d'un email unique.
 */
export const analyzeSingleEmail = async (email: EmailMessage, model: string, existingFolders: string[] = []): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    DÉCRET SYSTÈME TITAN : TU ES L'ARCHITECTE SUPRÊME DES BOÎTES GMAIL.
    MISSION : Analyser cet email avec une précision de 100%.
    
    DOSSIERS EXISTANTS DÉJÀ DÉTECTÉS : ${existingFolders.length > 0 ? existingFolders.join(', ') : 'Aucun'}
    CONSIGNE : Si l'email appartient à un domaine sémantique déjà couvert par un dossier existant, REUTILISE-LE pour éviter les doublons.

    EMAIL À TRAITER :
    De : ${email.from}
    Objet : ${email.subject}
    Contenu : ${email.snippet}

    RÉPONDS UNIQUEMENT AU FORMAT JSON SUIVANT :
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "NOM DU DOSSIER (MAJUSCULES)",
      "summary": "Résumé en 5 mots max",
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
    logger.error(`Échec Titan IA pour : ${email.subject}`, err);
    throw err;
  }
};

export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const resp = await ai.models.generateContent({ model, contents: "Dis OK" });
    return resp.text.toUpperCase().includes('OK');
  } catch (err) { return false; }
};
