import { AI_MODEL } from '../constants';
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const analyzeEmailsWithPuter = async (
  emails: EmailMessage[]
): Promise<Record<string, AIAnalysis>> => {
  if (!window.puter) {
    logger.error('Puter.js non détecté dans le contexte global.');
    throw new Error('Puter.js n\'est pas chargé.');
  }

  logger.info(`Préparation de l'analyse IA pour ${emails.length} emails...`);

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
    Ne mets pas de markdown, pas de code block (backticks), juste le JSON brut.

    Structure attendue pour chaque email:
    {
      "category": "Travail" | "Personnel" | "Finance" | "Promotions" | "Social" | "Urgent" | "Autre",
      "tags": ["tag1", "tag2"],
      "suggestedFolder": "Nom du dossier suggéré",
      "summary": "Court résumé en 5 mots",
      "sentiment": "Positif" | "Neutre" | "Négatif"
    }

    Emails à analyser:
    ${JSON.stringify(emailData)}
  `;

  try {
    logger.info(`Envoi de la requête à ${AI_MODEL} via Puter...`);
    const start = Date.now();
    
    const response = await window.puter.ai.chat(prompt, {
      model: AI_MODEL,
    });

    const duration = Date.now() - start;
    logger.success(`Réponse IA reçue en ${duration}ms`);

    let cleanText = response.text.trim();
    // Nettoyage Markdown
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```/, '').replace(/```$/, '');
    }

    try {
        const parsed = JSON.parse(cleanText);
        logger.info(`Parsing JSON réussi. ${Object.keys(parsed).length} emails analysés.`);
        return parsed;
    } catch (parseError) {
        logger.error("Erreur de parsing JSON de la réponse IA", { responseText: cleanText });
        throw new Error("L'IA a renvoyé un format invalide.");
    }

  } catch (error) {
    logger.error("Erreur critique lors de l'appel Puter.js", error);
    throw error;
  }
};
