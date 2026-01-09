
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
      resource: { 
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    logger.success(`Label créé : ${labelName}`);
    return response.result.id;
  } catch (err: any) {
    if (err.status === 409) {
      const list = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
      const existing = list.result.labels.find((l: any) => l.name === labelName);
      return existing?.id || null;
    }
    logger.error(`Erreur création label ${labelName}`, err);
    return null;
  }
};

export const applyTagsToEmail = async (emailId: string, tags: string[]) => {
  try {
    const labelIds = [];
    for (const tag of tags) {
      const id = await createGmailLabel(tag);
      if (id) labelIds.push(id);
    }

    if (labelIds.length > 0) {
      await window.gapi.client.gmail.users.messages.batchModify({
        userId: 'me',
        resource: {
          ids: [emailId],
          addLabelIds: labelIds
        }
      });
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`Erreur tags pour ${emailId}`, err);
    return false;
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
