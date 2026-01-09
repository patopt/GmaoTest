import { AI_MODEL } from '../constants';
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const analyzeEmailsWithPuter = async (
  emails: EmailMessage[]
): Promise<Record<string, AIAnalysis>> => {
  if (!window.puter) {
    logger.error('Puter.js manquant.');
    throw new Error('Puter.js non chargé.');
  }

  const emailData = emails.map((e) => ({
    id: e.id,
    subject: e.subject || 'Sans objet',
    snippet: e.snippet || '',
    from: e.from || 'Inconnu',
  }));

  const prompt = `
    Analyse ces emails Gmail et retourne UNIQUEMENT un objet JSON (clé = ID email).
    Format pour chaque email:
    {
      "category": "Travail" | "Personnel" | "Finance" | "Promotions" | "Social" | "Urgent" | "Autre",
      "tags": ["tag1", "tag2"],
      "suggestedFolder": "Nom du dossier",
      "summary": "Résumé en 5 mots",
      "sentiment": "Positif" | "Neutre" | "Négatif"
    }
    Données: ${JSON.stringify(emailData)}
  `;

  try {
    const response = await window.puter.ai.chat(prompt, { model: AI_MODEL });
    let text = response.text.trim();
    if (text.includes('```')) {
      text = text.replace(/```json|```/g, '').trim();
    }
    return JSON.parse(text);
  } catch (error) {
    logger.error("IA Error", error);
    throw error;
  }
};