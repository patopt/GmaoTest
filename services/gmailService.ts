import { logger } from '../utils/logger';

export const createGmailLabel = async (labelName: string): Promise<string | null> => {
  try {
    const response = await window.gapi.client.gmail.users.labels.create({
      userId: 'me',
      resource: { name: labelName }
    });
    return response.result.id;
  } catch (err: any) {
    if (err.status === 409) {
      // Label already exists, find its ID
      const list = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
      const existing = list.result.labels.find((l: any) => l.name === labelName);
      return existing?.id || null;
    }
    logger.error(`Erreur création label ${labelName}`, err);
    return null;
  }
};

export const moveEmailToLabel = async (messageId: string, labelName: string) => {
  try {
    // 1. Create label if not exists
    const labelId = await createGmailLabel(labelName);
    if (!labelId) return false;

    // 2. Modify message labels
    await window.gapi.client.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      resource: {
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX']
      }
    });
    return true;
  } catch (err) {
    logger.error(`Erreur déplacement email ${messageId}`, err);
    return false;
  }
};

export const applyBatchLabels = async (messageIds: string[], labelName: string) => {
  try {
    const labelId = await createGmailLabel(labelName);
    if (!labelId) return false;

    await window.gapi.client.gmail.users.messages.batchModify({
      userId: 'me',
      resource: {
        ids: messageIds,
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX']
      }
    });
    return true;
  } catch (err) {
    logger.error("Erreur batch modify labels", err);
    return false;
  }
};