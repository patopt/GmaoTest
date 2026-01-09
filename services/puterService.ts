import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';
// Import AI_MODEL from constants to provide a default model for analyses
import { AI_MODEL } from '../constants';

export const analyzeBatchWithPuter = async (
  emails: EmailMessage[],
  model: string,
  isQuick: boolean = false
): Promise<Record<string, AIAnalysis>> => {
  if (!window.puter) throw new Error('Puter.js non chargé.');

  const emailData = emails.map((e) => ({
    id: e.id,
    subject: e.subject || 'Sans objet',
    snippet: isQuick ? '' : (e.snippet || ''),
    from: e.from || 'Inconnu',
  }));

  const systemPrompt = `
    Tu es un expert en organisation d'emails Gmail. 
    Analyse ces ${emails.length} emails et retourne un objet JSON STRICT.
    Clé de l'objet = ID de l'email.
    Valeur = {
      "category": "Travail|Finance|Social|Urgent|Personnel|Autre",
      "tags": ["tag1", "tag2"],
      "suggestedFolder": "Dossier pertinent",
      "summary": "Résumé de 5 mots",
      "sentiment": "Positif|Neutre|Négatif"
    }
    IMPORTANT: Pas de texte autour, pas de backticks. Juste le JSON.
    ${isQuick ? "NOTE: Analyse uniquement basée sur les OBJETS (Quick Analysis)." : ""}
  `;

  try {
    const response = await window.puter.ai.chat(
      `${systemPrompt}\n\nDonnées: ${JSON.stringify(emailData)}`, 
      { model: model }
    );

    let text = response.text.trim();
    if (text.includes('```')) {
      text = text.replace(/```json|```/g, '').trim();
    }
    
    return JSON.parse(text);
  } catch (error) {
    logger.error("Erreur Puter.ai", error);
    throw error;
  }
};

/**
 * Export analyzeEmailsWithPuter to resolve:
 * Error in file services/aiService.ts: Module '"./puterService"' has no exported member 'analyzeEmailsWithPuter'.
 */
export const analyzeEmailsWithPuter = async (
  emails: EmailMessage[]
): Promise<Record<string, AIAnalysis>> => {
  return analyzeBatchWithPuter(emails, AI_MODEL);
};