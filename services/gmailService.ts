import { logger } from '../utils/logger';

export const getTotalInboxCount = async (): Promise<number> => {
  try {
    const response = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
    return response.result.messagesTotal || 0;
  } catch (err) {
    logger.error("Impossible de récupérer le compte total", err);
    return 0;
  }
};

export const createGmailLabel = async (labelName: string): Promise<string | null> => {
  try {
    const response = await window.gapi.client.gmail.users.labels.create({
      userId: 'me',
      resource: { name: labelName }
    });
    logger.success(`Label créé : ${labelName}`);
    return response.result.id;
  } catch (err: any) {
    if (err.status === 409) {
      const list = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
      const existing = list.result.labels.find((l: any) => l.name === labelName);
      return existing?.id || null;
    }
    return null;
  }
};

export const moveEmailsToLabel = async (ids: string[], labelName: string) => {
  try {
    const labelId = await createGmailLabel(labelName);
    if (!labelId) return false;

    await window.gapi.client.gmail.users.messages.batchModify({
      userId: 'me',
      resource: {
        ids: ids,
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX']
      }
    });
    return true;
  } catch (err) {
    logger.error(`Erreur déplacement groupé vers ${labelName}`, err);
    return false;
  }
};