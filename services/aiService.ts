import { AIAnalysis, EmailMessage } from '../types';
import { analyzeEmailsWithPuter } from './puterService';
import { analyzeEmailsWithGemini } from './geminiService';
import { logger } from '../utils/logger';
import { GoogleGenAI } from "@google/genai";
import { AI_MODEL } from '../constants';

export type AIProvider = 'puter' | 'gemini-sdk';

export const analyzeEmails = async (
  emails: EmailMessage[],
  provider: AIProvider
): Promise<Record<string, AIAnalysis>> => {
  logger.info(`Utilisation du fournisseur IA : ${provider}`);
  if (provider === 'puter') {
    return analyzeEmailsWithPuter(emails);
  } else {
    return analyzeEmailsWithGemini(emails);
  }
};

export const testAIConnection = async (provider: AIProvider): Promise<boolean> => {
  const testPrompt = "Répond uniquement par le mot 'OK' si tu reçois ce message.";
  
  try {
    if (provider === 'puter') {
      if (!window.puter) return false;
      const response = await window.puter.ai.chat(testPrompt, { model: AI_MODEL });
      return response.text.toLowerCase().includes('ok');
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: testPrompt
      });
      return response.text.toLowerCase().includes('ok');
    }
  } catch (err) {
    logger.error(`Échec du test IA (${provider})`, err);
    return false;
  }
};