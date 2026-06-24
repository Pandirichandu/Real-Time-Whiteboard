import './setup';
import * as redisModule from '../config/redis';
import { YjsDocRegistry } from '../sockets/yjsStore';
import * as Y from 'yjs';
import { prisma } from '../config/db';

const runScalabilityTests = async () => {
  console.log('🚀 Running scalability validation test suite...');

  // 1. Setup mock Redis Pub/Sub broker
  const channelSubscriptions = new Map<string, Array<(msg: string) => void>>();

  const mockPublisher = {
    publish: async (channel: string, message: string) => {
      const list = channelSubscriptions.get(channel) || [];
      list.forEach((cb) => cb(message));
      return 1;
    }
  };

  const mockSubscriber = {
    subscribe: async (channel: string, cb: (msg: string) => void) => {
      const list = channelSubscriptions.get(channel) || [];
      list.push(cb);
      channelSubscriptions.set(channel, list);
    },
    unsubscribe: async (channel: string) => {
      channelSubscriptions.delete(channel);
    }
  };

  // Inject mocks into Redis config module exports
  (redisModule as any).redisPublisher = mockPublisher;
  (redisModule as any).redisSubscriber = mockSubscriber;

  console.log('✅ Mock Redis Pub/Sub brokers injected.');

  try {
    const boardId = '11111111-2222-3333-4444-scalatestboard';

    // Seed mock DB board
    await prisma.board.create({
      data: {
        id: boardId,
        title: 'Scalability Test Workspace',
        ownerId: 'owner-id',
        isArchived: false,
        visibility: 'PRIVATE',
      }
    });

    // 2. Instantiate two simulated server nodes
    console.log('\nSimulating multi-node whiteboard cluster...');
    const nodeA = new YjsDocRegistry();
    const nodeB = new YjsDocRegistry();

    // Verify distinct node server ids
    const idA = (nodeA as any).serverId;
    const idB = (nodeB as any).serverId;
    console.log(`Node A initialized with ServerID: ${idA}`);
    console.log(`Node B initialized with ServerID: ${idB}`);

    if (idA === idB) {
      throw new Error('Simulated cluster nodes must have unique serverIDs.');
    }

    // 3. Load workspace Yjs docs on both nodes
    const docA = await nodeA.getOrCreateDoc(boardId);
    const docB = await nodeB.getOrCreateDoc(boardId);

    console.log('✅ Documents loaded and subscribed on both nodes.');

    // 4. Perform update on Node A and verify propagation to Node B
    console.log('\nBroadcasting draw action from Node A to Node B...');
    
    // Simulate user editing on Node A
    const mapA = docA.getMap('elements');
    
    const localUpdate = Y.transact(docA, () => {
      mapA.set('shape-1', { type: 'rectangle', color: 'indigo', width: 100 });
    });

    const updateBuffer = Y.encodeStateAsUpdate(docA);

    // Apply incremental update on Node A.
    // This will trigger local merge and publish event to Redis Pub/Sub.
    await nodeA.applyUpdate(boardId, updateBuffer);

    // Verify Node B received the changes from Node A via mock Pub/Sub
    const mapB = docB.getMap('elements');
    const shapeOnNodeB = mapB.get('shape-1') as any;

    if (!shapeOnNodeB) {
      throw new Error('Sync failed: Node B did not receive the update!');
    }

    if (shapeOnNodeB.color !== 'indigo') {
      throw new Error(`Sync data mismatch: Node B has color: ${shapeOnNodeB.color}, expected: indigo`);
    }

    console.log('✅ Node B successfully received Node A update and synchronized.');
    console.log(`Node B value: ${JSON.stringify(shapeOnNodeB)}`);

    // 5. Verify single-node database save delegation
    console.log('\nChecking DB save delegation rules...');
    const hasTimeoutA = (nodeA as any).saveTimeouts.has(boardId);
    const hasTimeoutB = (nodeB as any).saveTimeouts.has(boardId);

    console.log(`Node A save timer scheduled: ${hasTimeoutA}`);
    console.log(`Node B save timer scheduled: ${hasTimeoutB}`);

    if (!hasTimeoutA) {
      throw new Error('Expect Node A (originator) to schedule a debounced DB save.');
    }

    if (hasTimeoutB) {
      throw new Error('Expect Node B (receiver) to delegate DB saving to Node A.');
    }

    console.log('✅ Only originator node handles DB save. CPU/DB overhead reduced!');

    // 6. Clean up
    console.log('\nClearing documents and unsubscribing...');
    await nodeA.clearDoc(boardId);
    await nodeB.clearDoc(boardId);

    if (channelSubscriptions.has(`board-updates:${boardId}`)) {
      throw new Error('Unsubscribe failed: channel remains active.');
    }
    console.log('✅ Unsubscribe successful. Connections cleared.');

    console.log('\n🎉 ALL SCALABILITY VALIDATION TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ SCALABILITY VALIDATION TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.board.deleteMany({});
    console.log('Cleaned mock DB.');
  }
};

runScalabilityTests();
