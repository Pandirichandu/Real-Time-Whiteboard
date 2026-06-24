import * as Y from 'yjs';
import { prisma } from '../config/db';
import { redisPublisher, redisSubscriber } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

export class YjsDocRegistry {
  private docs: Map<string, Y.Doc> = new Map();
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private serverId: string = uuidv4();
  private activeSubscriptions: Set<string> = new Set();

  /**
   * Retrieves or creates an active Y.Doc instance for a board.
   * If not cached, it loads the document state from PostgreSQL and joins the Redis Pub/Sub channel.
   */
  public async getOrCreateDoc(boardId: string): Promise<Y.Doc> {
    if (this.docs.has(boardId)) {
      return this.docs.get(boardId)!;
    }

    const doc = new Y.Doc();
    
    // Load existing Yjs state from PostgreSQL
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { yjsState: true },
    });

    if (board?.yjsState) {
      try {
        Y.applyUpdate(doc, new Uint8Array(board.yjsState));
      } catch (err) {
        console.error(`Failed to apply Yjs binary update for board ${boardId}:`, err);
      }
    }

    this.docs.set(boardId, doc);

    // Subscribe to Redis Pub/Sub topic for real-time multi-node synchronization
    await this.subscribeToRedisChannel(boardId, doc);

    return doc;
  }

  /**
   * Subscribes local memory document to Redis channel updates.
   */
  private async subscribeToRedisChannel(boardId: string, doc: Y.Doc) {
    if (!redisSubscriber || this.activeSubscriptions.has(boardId)) return;

    try {
      const channel = `board-updates:${boardId}`;
      await redisSubscriber.subscribe(channel, (message) => {
        try {
          const payload = JSON.parse(message);
          
          // Only apply updates that originated from other servers
          if (payload.serverId !== this.serverId) {
            const updateBuffer = Buffer.from(payload.update, 'base64');
            Y.applyUpdate(doc, new Uint8Array(updateBuffer), 'redis-pubsub');
          }
        } catch (err) {
          console.error(`Error parsing Redis Pub/Sub message for board ${boardId}:`, err);
        }
      });
      this.activeSubscriptions.add(boardId);
      console.log(`Node ${this.serverId} successfully subscribed to Redis channel: ${channel}`);
    } catch (err) {
      console.error(`Failed to subscribe to Redis updates for board ${boardId}:`, err);
    }
  }

  /**
   * Applies an incremental update buffer received from a local client,
   * broadcasts it via Redis Pub/Sub to other nodes, and schedules local DB persistence.
   */
  public async applyUpdate(boardId: string, updateBuffer: Uint8Array, origin: any = null): Promise<void> {
    const doc = await this.getOrCreateDoc(boardId);
    
    try {
      Y.applyUpdate(doc, updateBuffer, origin);
      
      // Do not republish updates that came from the Redis subscription itself
      if (origin !== 'redis-pubsub') {
        // Broadcast the update payload to other servers via Redis Pub/Sub
        if (redisPublisher) {
          const payload = {
            serverId: this.serverId,
            update: Buffer.from(updateBuffer).toString('base64'),
          };
          redisPublisher.publish(`board-updates:${boardId}`, JSON.stringify(payload));
        }

        // Only the node receiving direct client input handles debounced PostgreSQL saving
        this.scheduleSave(boardId);
      }
    } catch (err) {
      console.error(`Failed to apply incremental update to board ${boardId}:`, err);
    }
  }

  /**
   * Schedules a debounced database save to avoid overloading PostgreSQL on every mouse stroke.
   */
  private scheduleSave(boardId: string) {
    if (this.saveTimeouts.has(boardId)) {
      clearTimeout(this.saveTimeouts.get(boardId));
    }

    const timeout = setTimeout(async () => {
      await this.saveDoc(boardId);
      this.saveTimeouts.delete(boardId);
    }, 5000); // Debounce save by 5 seconds

    this.saveTimeouts.set(boardId, timeout);
  }

  /**
   * Encodes and persists the in-memory document state to PostgreSQL.
   */
  public async saveDoc(boardId: string): Promise<void> {
    const doc = this.docs.get(boardId);
    if (!doc) return;

    try {
      const stateUpdate = Y.encodeStateAsUpdate(doc);
      await prisma.board.update({
        where: { id: boardId },
        data: {
          yjsState: Buffer.from(stateUpdate),
        },
      });
      console.log(`Saved Yjs state for board ${boardId} to PostgreSQL`);
    } catch (err) {
      console.error(`Failed to save Yjs state for board ${boardId}:`, err);
    }
  }

  /**
   * Removes a document from cache and unsubscribes from Redis channel when all users leave a board.
   */
  public async clearDoc(boardId: string): Promise<void> {
    // Save any pending updates first
    if (this.saveTimeouts.has(boardId)) {
      clearTimeout(this.saveTimeouts.get(boardId));
      this.saveTimeouts.delete(boardId);
      await this.saveDoc(boardId);
    }

    // Unsubscribe from Redis Pub/Sub channel
    if (redisSubscriber && this.activeSubscriptions.has(boardId)) {
      try {
        await redisSubscriber.unsubscribe(`board-updates:${boardId}`);
        this.activeSubscriptions.delete(boardId);
        console.log(`Node ${this.serverId} unsubscribed from board-updates:${boardId}`);
      } catch (err) {
        console.error(`Failed to unsubscribe from Redis updates for board ${boardId}:`, err);
      }
    }

    this.docs.delete(boardId);
  }
}

export const yjsRegistry = new YjsDocRegistry();
