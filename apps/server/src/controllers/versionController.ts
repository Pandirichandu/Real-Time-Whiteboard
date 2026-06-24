import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { yjsRegistry } from '../sockets/yjsStore';

export const createSnapshot = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId } = req.params;

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { yjsState: true, ownerId: true },
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    // Force-save current in-memory doc to database to get freshest state
    await yjsRegistry.saveDoc(boardId);

    // Fetch the updated state from database
    const freshBoard = await prisma.board.findUnique({
      where: { id: boardId },
      select: { yjsState: true },
    });

    if (!freshBoard?.yjsState) {
      return res.status(400).json({ status: 'error', message: 'No canvas elements to snapshot' });
    }

    // Determine next version number
    const lastVersion = await prisma.boardVersion.findFirst({
      where: { boardId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = (lastVersion?.version || 0) + 1;

    const versionSnapshot = await prisma.boardVersion.create({
      data: {
        boardId,
        version: nextVersion,
        snapshotUrl: '', // S3 screenshot preview can be uploaded here later
        yjsState: freshBoard.yjsState,
        createdById: req.user.userId,
      },
    });

    // Create an Activity Log entry
    await prisma.activityLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE_SNAPSHOT',
        details: `Created version snapshot #${nextVersion} for board ${boardId}`,
      },
    });

    res.status(201).json({
      status: 'success',
      data: {
        id: versionSnapshot.id,
        version: versionSnapshot.version,
        createdAt: versionSnapshot.createdAt,
      },
    });
  } catch (error) {
    console.error('Create snapshot error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const getVersions = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId } = req.params;

  try {
    const versions = await prisma.boardVersion.findMany({
      where: { boardId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        createdAt: true,
        createdById: true,
        snapshotUrl: true,
      },
    });

    res.json({
      status: 'success',
      data: versions,
    });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const restoreVersion = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId, versionId } = req.params;

  try {
    const version = await prisma.boardVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.boardId !== boardId) {
      return res.status(404).json({ status: 'error', message: 'Version snapshot not found' });
    }

    if (!version.yjsState) {
      return res.status(400).json({ status: 'error', message: 'Selected snapshot contains no data' });
    }

    // 1. Force clear memory cache of document
    await yjsRegistry.clearDoc(boardId);

    // 2. Set database Board state to snapshot state
    await prisma.board.update({
      where: { id: boardId },
      data: {
        yjsState: version.yjsState,
      },
    });

    // 3. Log recovery operation
    await prisma.activityLog.create({
      data: {
        userId: req.user.userId,
        action: 'RESTORE_VERSION',
        details: `Restored board ${boardId} to snapshot version #${version.version}`,
      },
    });

    res.json({
      status: 'success',
      message: `Board restored successfully to version #${version.version}`,
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

export const getActivityLogs = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;

    const logs = await prisma.activityLog.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });

    res.json({
      status: 'success',
      data: logs,
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
