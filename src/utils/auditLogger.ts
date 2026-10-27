import prisma from '../config/database';

export interface AuditLogData {
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
}

export const logAuditEvent = async (data: AuditLogData) => {
  try {
    return await prisma.auditLog.create({
      data: {
        actorUserId: data.actorUserId || null,
        actorName: data.actorName || null,
        actorRole: data.actorRole || null,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId || null,
        details: data.details || null,
        ipAddress: data.ipAddress || null,
      },
    });
  } catch (err) {
    console.warn('Audit logger notice (non-blocking):', err);
    return null;
  }
};
