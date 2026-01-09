import { logger } from '../utils/logger';
import { EnrichedEmail } from '../types';

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

export const moveEmailToLabel = async (messageId: string, labelName: string) => {
  try {
    const labelId = await createGmailLabel(labelName);
    if (!labelId) return false;

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

export const bulkOrganize = async (emails: EnrichedEmail[]) => {
  const processed = emails.filter(e => e.processed && e.analysis?.suggestedFolder);
  if (processed.length === 0) return 0;

  const folders = Array.from(new Set(processed.map(e => e.analysis!.suggestedFolder)));
  let count = 0;

  for (const folder of folders) {
    const labelId = await createGmailLabel(folder);
    if (!labelId) continue;

    const emailsInFolder = processed.filter(e => e.analysis!.suggestedFolder === folder);
    const ids = emailsInFolder.map(e => e.id);

    try {
      await window.gapi.client.gmail.users.messages.batchModify({
        userId: 'me',
        resource: {
          ids: ids,
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX']
        }
      });
      count += ids.length;
    } catch (err) {
      logger.error(`Erreur déplacement groupé vers ${folder}`, err);
    }
  }
  return count;
};