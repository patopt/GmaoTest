
import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const cleanAIResponse = (text: string): string => {
  let clean = text.trim();
  // Enlever les blocs de code Markdown si présents
  if (clean.includes('```')) {
    clean = clean.replace(/```json|```/g, '').trim();
  }
  // Trouver le premier { et le dernier } pour isoler le JSON pur
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean;
};

/**
 * MOTEUR D'ANALYSE INDIVIDUEL UNIFIÉ (TITAN)
 * Supporte Puter.js et Gemini SDK
 */
export const analyzeSingleEmail = async (
  email: EmailMessage, 
  model: string, 
  provider: string, 
  existingFolders: string[] = []
): Promise<AIAnalysis> => {
  
  const prompt = `
    DÉCRET SYSTÈME TITAN : TU ES L'ARCHITECTE SUPRÊME DES BOÎTES GMAIL.
    MISSION : Analyser cet email avec une précision de 100%.
    
    DOSSIERS EXISTANTS DÉJÀ DÉTECTÉS : ${existingFolders.length > 0 ? existingFolders.join(', ') : 'Aucun'}
    CONSIGNE : Si l'email appartient à un domaine sémantique déjà couvert par un dossier existant, REUTILISE-LE pour éviter les doublons.

    EMAIL À TRAITER :
    De : ${email.from}
    Objet : ${email.subject}
    Contenu : ${email.snippet}

    TU DOIS RÉPONDRE UNIQUEMENT PAR UN OBJET JSON VALIDE (PAS DE TEXTE, PAS DE COMMENTAIRE) :
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "NOM DU DOSSIER",
      "summary": "Résumé en 5 mots max",
      "sentiment": "Positif|Neutre|Négatif"
    }
  `;

  try {
    let responseText = "";

    if (provider === 'puter') {
      if (!window.puter) throw new Error("Puter non disponible");
      const response = await window.puter.ai.chat(prompt, { model: model });
      responseText = typeof response === 'string' ? response : response.text;
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });
      responseText = response.text;
    }

    const cleanedJson = cleanAIResponse(responseText);
    return JSON.parse(cleanedJson);
  } catch (err) {
    logger.error(`Erreur IA (${provider}) pour : ${email.subject}`, err);
    throw err;
  }
};

export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    if (provider === 'puter') {
      const resp = await window.puter.ai.chat("Dis 'OK' en un mot", { model });
      const text = typeof resp === 'string' ? resp : resp.text;
      return text.toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: "Dis 'OK' en un mot" });
      return resp.text.toUpperCase().includes('OK');
    }
  } catch (err) { return false; }
};
