import { GoogleGenAI, Type } from "@google/genai";
import { AI_MODEL } from '../constants';
import { AIAnalysis, EmailMessage } from '../types';
import { logger } from '../utils/logger';

export const analyzeEmailsWithGemini = async (
  emails: EmailMessage[]
): Promise<Record<string, AIAnalysis>> => {
  if (emails.length === 0) return {};

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const emailData = emails.map((e) => ({
    id: e.id,
    subject: e.subject || 'Sans objet',
    snippet: e.snippet || '',
    from: e.from || 'Inconnu',
  }));

  try {
    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: `Analyse ces emails Gmail et catégorise-les : ${JSON.stringify(emailData)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  emailId: { type: Type.STRING },
                  category: { 
                    type: Type.STRING, 
                    enum: ["Travail", "Personnel", "Finance", "Promotions", "Social", "Urgent", "Autre"]
                  },
                  tags: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  suggestedFolder: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  sentiment: { 
                    type: Type.STRING,
                    enum: ["Positif", "Neutre", "Négatif"]
                  }
                },
                required: ["emailId", "category", "tags", "suggestedFolder", "summary", "sentiment"]
              }
            }
          }
        }
      }
    });

    const parsedResponse = JSON.parse(response.text);
    const results: Record<string, AIAnalysis> = {};
    
    parsedResponse.analysis.forEach((item: any) => {
      const { emailId, ...data } = item;
      results[emailId] = data;
    });

    return results;
  } catch (error) {
    logger.error("Erreur Gemini SDK", error);
    throw error;
  }
};