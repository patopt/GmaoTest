
import { logger } from '../utils/logger';
import { FolderStyle } from '../types';

export const getTotalInboxCount = async (): Promise<number> => {
  try {
    const response = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
    return response.result.messagesTotal || 0;
  } catch (err) {
    logger.error("Impossible de récupérer le compte total", err);
    return 0;
  }
};

let folderCounter = 1;

export const createGmailLabel = async (labelName: string, style: FolderStyle = 'standard'): Promise<string | null> => {
  let finalName = labelName;
  if (style === 'numbered') {
    const prefix = folderCounter.toString().padStart(2, '0');
    finalName = `${prefix}. ${labelName}`;
  }

  try {
    const response = await window.gapi.client.gmail.users.labels.create({
      userId: 'me',
      resource: { 
        name: finalName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    logger.success(`Label créé : ${finalName}`);
    folderCounter++;
    return response.result.id;
  } catch (err: any) {
    if (err.status === 409) {
      const list = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
      const existing = list.result.labels.find((l: any) => l.name === finalName || l.name.endsWith(labelName));
      return existing?.id || null;
    }
    logger.error(`Erreur création label ${finalName}`, err);
    return null;
  }
};

export const applyTagsToEmail = async (emailId: string, tags: string[], style: FolderStyle = 'standard') => {
  try {
    const labelIds = [];
    for (const tag of tags) {
      const id = await createGmailLabel(tag, style);
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

export const moveEmailsToLabel = async (ids: string[], labelName: string, style: FolderStyle = 'standard') => {
  try {
    const labelId = await createGmailLabel(labelName, style);
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
