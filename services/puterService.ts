import { AI_MODEL } from '../constants';
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const analyzeEmailsWithPuter = async (
  emails: EmailMessage[]
): Promise<Record<string, AIAnalysis>> => {
  if (!window.puter) {
    logger.error('Puter.js non détecté.');
    throw new Error('Puter.js n\'est pas chargé.');
  }

  const emailData = emails.map((e) => ({
    id: e.id,
    subject: e.subject || 'Sans objet',
    snippet: e.snippet || '',
    from: e.from || 'Inconnu',
  }));

  const prompt = `
    Tu es un assistant expert en organisation d'emails.
    Analyse la liste d'emails suivante (format JSON).
    Pour chaque email, retourne une analyse structurée.
    
    Tu DOIS répondre UNIQUEMENT avec un objet JSON valide où la clé est l'ID de l'email.
    Structure:
    {
      "category": "Travail" | "Personnel" | "Finance" | "Promotions" | "Social" | "Urgent" | "Autre",
      "tags": ["tag1", "tag2"],
      "suggestedFolder": "Nom du dossier",
      "summary": "Court résumé",
      "sentiment": "Positif" | "Neutre" | "Négatif"
    }

    Emails:
    ${JSON.stringify(emailData)}
  `;

  try {
    const response = await window.puter.ai.chat(prompt, {
      model: AI_MODEL,
    });

    let cleanText = response.text.trim();
    if (cleanText.includes('```')) {
      cleanText = cleanText.replace(/```json|```/g, '').trim();
    }

    return JSON.parse(cleanText);
  } catch (error) {
    logger.error("Erreur IA Puter", error);
    throw error;
  }
};