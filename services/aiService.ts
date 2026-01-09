
import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

/**
 * Nettoie la réponse de l'IA pour extraire un JSON pur.
 * Gère les blocs Markdown, le texte superflu avant/après et les erreurs de formatage.
 */
export const cleanAIResponse = (text: string): string => {
  let clean = text.trim();
  
  // Suppression des blocs de code Markdown
  if (clean.includes('```')) {
    clean = clean.replace(/```json|```/g, '').trim();
  }

  // Isolation sémantique du JSON : on cherche de la première accolade à la dernière
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  
  return clean;
};

/**
 * MOTEUR D'ANALYSE INDIVIDUEL TITAN (Unifié Puter/Gemini SDK)
 * Traite un email unique pour une précision maximale.
 */
export const analyzeSingleEmail = async (
  email: EmailMessage, 
  model: string, 
  provider: string, 
  existingFolders: string[] = []
): Promise<AIAnalysis> => {
  
  const prompt = `
    RÔLE : ARCHITECTE SUPRÊME GMAIL.
    MISSION : Analyser cet email avec une précision absolue.
    
    DOSSIERS EXISTANTS DÉJÀ DÉTECTÉS : ${existingFolders.length > 0 ? existingFolders.join(', ') : 'Aucun'}
    CONSIGNE : Si l'email appartient à un domaine déjà couvert par un dossier existant, réutilise-le EXACTEMENT.

    EMAIL :
    De : ${email.from}
    Objet : ${email.subject}
    Snippet : ${email.snippet}

    RÉPONDS UNIQUEMENT PAR UN OBJET JSON VALIDE (SANS TEXTE AUTOUR) :
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
      if (!window.puter) {
        throw new Error("Puter.js n'est pas disponible dans le window.");
      }
      
      // Appel Puter.js v2 tel que documenté
      const response = await window.puter.ai.chat(prompt, { 
        model: model 
      });

      // Dans Puter.js v2, la réponse peut être un objet avec .text ou une string
      responseText = (typeof response === 'string') ? response : (response.text || response.toString());
      
      if (!responseText) {
        throw new Error("Réponse vide de Puter.ai");
      }
    } else {
      // Version SDK Gemini Natif
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });
      responseText = response.text || "";
    }

    const cleanedJson = cleanAIResponse(responseText);
    const parsed = JSON.parse(cleanedJson);
    
    // Validation minimale des champs requis
    if (!parsed.suggestedFolder || !parsed.category) {
      throw new Error("JSON incomplet");
    }

    return parsed;
  } catch (err) {
    logger.error(`Erreur IA (${provider}) pour : ${email.subject}`, err);
    throw err;
  }
};

/**
 * Teste la connexion au provider IA choisi.
 */
export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    const testPrompt = "Dis exactement 'OK'";
    if (provider === 'puter') {
      if (!window.puter) return false;
      const resp = await window.puter.ai.chat(testPrompt, { model });
      const text = (typeof resp === 'string') ? resp : (resp.text || resp.toString());
      return text.toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model, contents: testPrompt });
      return resp.text?.toUpperCase().includes('OK') || false;
    }
  } catch (err) { 
    logger.error(`Échec test connexion IA (${provider})`, err);
    return false; 
  }
};
