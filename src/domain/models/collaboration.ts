import { z } from 'zod';

const personSchema = z.object({
  id: z.string().min(1), email: z.string().email(), name: z.string(),
  googleSub: z.string().optional(), picture: z.string().optional(),
});
export const invitationSchema = z.object({
  id: z.string().min(1), kind: z.enum(['friend', 'group']),
  sender: personSchema, recipientEmail: z.string().email(),
  sourceId: z.string().min(1), spreadsheetId: z.string().min(1),
  groupName: z.string(), currency: z.string().length(3),
  createdAt: z.string(),
});
export type InvitationDetails = z.infer<typeof invitationSchema>;
export type InvitationStatus = 'pending' | 'accepted' | 'active' | 'declined' | 'cancelled';
export interface CollaborationInvitation extends InvitationDetails {
  fileId: string;
  status: InvitationStatus;
  recipient?: z.infer<typeof personSchema>;
  accountEmail: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function canRespond(invite: InvitationDetails, email: string) {
  return normalizeEmail(invite.recipientEmail) === normalizeEmail(email);
}
export function isIncoming(invite: InvitationDetails, email: string) {
  return canRespond(invite, email);
}
