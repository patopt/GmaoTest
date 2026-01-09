
import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const cleanAIResponse = (text: string): string => {
  let clean = text.trim();
  if (clean.includes('```')) {
    clean = clean.replace(/```json|```/g, '').trim();
  }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean;
};

export const analyzeSingleEmail = async (
  email: EmailMessage, 
  model: string, 
  provider: string, 
  existingFolders: string[] = []
): Promise<AIAnalysis> => {
  
  const prompt = `
    RÔLE : ORGANISATEUR GMAIL TITAN.
    
    DOSSIERS EXISTANTS DANS LE GMAIL DE L'UTILISATEUR : 
    ${existingFolders.length > 0 ? existingFolders.join(', ') : 'Aucun'}

    MISSION : Analyser cet email. 
    CONSIGNE : Réutilise impérativement un dossier de la liste ci-dessus s'il est pertinent. Ne crée un nouveau dossier que si aucune catégorie existante ne convient.
    
    EMAIL :
    De : ${email.from}
    Objet : ${email.subject}
    Snippet : ${email.snippet}

    RÉPONDS UNIQUEMENT EN JSON :
    {
      "category": "Travail|Personnel|Finance|Social|Urgent|Autre",
      "tags": ["Tag1", "Tag2"],
      "suggestedFolder": "NOM_DU_DOSSIER",
      "summary": "Résumé de 5 mots",
      "sentiment": "Positif|Neutre|Négatif"
    }
  `;

  try {
    let responseText = "";
    if (provider === 'puter') {
      const response = await window.puter.ai.chat(prompt, { model });
      responseText = (typeof response === 'string') ? response : (response.text || response.toString());
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.1 }
      });
      responseText = response.text || "";
    }

    const cleanedJson = cleanAIResponse(responseText);
    const parsed = JSON.parse(cleanedJson);
    return parsed;
  } catch (err) {
    logger.error(`Erreur IA : ${email.subject}`, err);
    throw err;
  }
};

export const testAIConnection = async (provider: string, model: string): Promise<boolean> => {
  try {
    const testPrompt = "Réponds 'OK'";
    if (provider === 'puter') {
      if (!window.puter) return false;
      const resp = await window.puter.ai.chat(testPrompt, { model });
      const text = (typeof resp === 'string') ? resp : (resp.text || resp.toString());
      return text.toUpperCase().includes('OK');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: testPrompt });
      return resp.text?.toUpperCase().includes('OK') || false;
    }
  } catch { return false; }
};
