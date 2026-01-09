
import { logger } from '../utils/logger';
import { FolderStyle } from '../types';

export const getTotalInboxCount = async (): Promise<number> => {
  try {
    const response = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
    return response.result.messagesTotal || 0;
  } catch (err) {
    logger.error("Erreur GAPI Profil", err);
    throw err;
  }
};

export const getUserLabels = async (): Promise<string[]> => {
  try {
    const response = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
    return (response.result.labels || [])
      .filter((l: any) => l.type === 'user')
      .map((l: any) => l.name);
  } catch (err) {
    logger.error("Erreur récupération labels", err);
    return [];
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
    return null;
  }
};

export const renameAllLabelsToStyle = async (style: FolderStyle) => {
  try {
    const response = await window.gapi.client.gmail.users.labels.list({ userId: 'me' });
    const labels = response.result.labels.filter((l: any) => l.type === 'user');
    
    let count = 1;
    for (const label of labels) {
      let cleanName = label.name.replace(/^\d{2}\.\s/, '');
      let newName = cleanName;
      
      if (style === 'numbered') {
        newName = `${count.toString().padStart(2, '0')}. ${cleanName}`;
      }

      if (label.name !== newName) {
        await window.gapi.client.gmail.users.labels.update({
          userId: 'me',
          id: label.id,
          resource: { name: newName }
        });
        logger.info(`Renommage : ${label.name} -> ${newName}`);
      }
      count++;
    }
    logger.success("Style de nomenclature appliqué.");
  } catch (err) {
    logger.error("Erreur lors du renommage des dossiers", err);
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
        resource: { ids: [emailId], addLabelIds: labelIds }
      });
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
};

export const moveEmailsToLabel = async (ids: string[], labelName: string, style: FolderStyle = 'standard') => {
  try {
    const labelId = await createGmailLabel(labelName, style);
    if (!labelId) return false;
    await window.gapi.client.gmail.users.messages.batchModify({
      userId: 'me',
      resource: { ids: ids, addLabelIds: [labelId], removeLabelIds: ['INBOX'] }
    });
    return true;
  } catch (err) {
    return false;
  }
};
