import './setup';
import { createServer } from 'http';
import app from '../app';
import { prisma } from '../config/db';

const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

const runSecurityTests = async () => {
  console.log('🚀 Running security validation test suite...');
  const server = createServer(app).listen(PORT);

  const request = async (path: string, options: any = {}) => {
    const url = `${BASE_URL}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  };

  try {
    // 1. Setup User Profiles
    const emailA = `usera_${Date.now()}@security.com`;
    const emailB = `userb_${Date.now()}@security.com`;

    const regA = await request('/auth/register', {
      method: 'POST',
      body: { email: emailA, password: 'Password123!', name: 'User A' },
    });
    const regB = await request('/auth/register', {
      method: 'POST',
      body: { email: emailB, password: 'Password123!', name: 'User B' },
    });

    const loginA = await request('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: 'Password123!' },
    });
    const loginB = await request('/auth/login', {
      method: 'POST',
      body: { email: emailB, password: 'Password123!' },
    });

    const tokenA = (loginA.data as any).data.accessToken;
    const tokenB = (loginB.data as any).data.accessToken;
    
    const headersA = { Authorization: `Bearer ${tokenA}` };
    const headersB = { Authorization: `Bearer ${tokenB}` };

    console.log('✅ Users registered and tokens issued.');

    // 2. Path Traversal Vulnerability check
    console.log('\nTesting Path Traversal protection in handleLocalDevUpload...');
    const traverseRes = await request('/files/upload-local?key=../../package.json', {
      method: 'PUT',
      headers: headersA,
      body: { content: 'exploit' },
    });
    if (traverseRes.status !== 403) {
      throw new Error(`Path traversal vulnerability exists! Expected status 403, got ${traverseRes.status}`);
    }
    console.log('✅ Path traversal protection blocked execution successfully.');

    // 3. JWT validation check
    console.log('\nTesting JWT access protection...');
    const noTokenRes = await request('/boards', { method: 'GET' });
    if (noTokenRes.status !== 401) {
      throw new Error(`Auth bypass succeeded without token! Got ${noTokenRes.status}`);
    }
    
    const badTokenRes = await request('/boards', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid_signature_token' },
    });
    if (badTokenRes.status !== 401) {
      throw new Error(`Auth bypass succeeded with invalid token! Got ${badTokenRes.status}`);
    }
    console.log('✅ JWT verification rejected unauthorized tokens.');

    // 4. Board Authorization checks
    console.log('\nTesting Board Authorization access barriers...');
    
    // User A creates a Board
    const createBoardRes = await request('/boards', {
      method: 'POST',
      headers: headersA,
      body: { title: 'User A Secret Board', visibility: 'PRIVATE' },
    });
    const boardId = (createBoardRes.data as any).data.id;
    console.log(`Board created by User A (ID: ${boardId})`);

    // User B attempts to access User A's private board details
    const getBoardRes = await request(`/boards/${boardId}`, {
      method: 'GET',
      headers: headersB,
    });
    if (getBoardRes.status !== 403) {
      throw new Error(`Authorization check failed for getBoard! User B got status: ${getBoardRes.status}`);
    }
    console.log('✅ Access denied for User B attempting to view private board.');

    // User B attempts to update User A's board details
    const patchBoardRes = await request(`/boards/${boardId}`, {
      method: 'PATCH',
      headers: headersB,
      body: { title: 'Defaced Board' },
    });
    if (patchBoardRes.status !== 403) {
      throw new Error(`Authorization check failed for patchBoard! Got status: ${patchBoardRes.status}`);
    }
    console.log('✅ Access denied for User B attempting to update board.');

    // User B attempts to write comments to User A's board
    const commentRes = await request(`/boards/${boardId}/comments`, {
      method: 'POST',
      headers: headersB,
      body: { text: 'Spam comment', x: 10, y: 10 },
    });
    if (commentRes.status !== 403) {
      console.log('commentRes failed debug:', commentRes.status, commentRes.data);
      throw new Error(`Authorization check failed for comments! Got status: ${commentRes.status}`);
    }
    console.log('✅ Access denied for User B attempting to add comments.');

    // User B attempts to create version snapshots on User A's board
    const versionRes = await request(`/boards/${boardId}/versions`, {
      method: 'POST',
      headers: headersB,
    });
    if (versionRes.status !== 403) {
      throw new Error(`Authorization check failed for versions! Got status: ${versionRes.status}`);
    }
    console.log('✅ Access denied for User B attempting to create snapshots.');

    // User B attempts to request S3 upload urls under User A's board
    const uploadRes = await request('/files/presigned', {
      method: 'POST',
      headers: headersB,
      body: { boardId, fileName: 'test.png', fileType: 'image/png', fileSize: 500 },
    });
    if (uploadRes.status !== 403) {
      throw new Error(`Authorization check failed for file presigned uploads! Got status: ${uploadRes.status}`);
    }
    console.log('✅ Access denied for User B attempting uploads.');

    // User B attempts to call AI layout or copilot endpoints under User A's board
    const aiLayoutRes = await request('/ai/layout', {
      method: 'POST',
      headers: headersB,
      body: { boardId, elements: [] },
    });
    if (aiLayoutRes.status !== 403) {
      throw new Error(`Authorization check failed for AI layout! Got status: ${aiLayoutRes.status}`);
    }
    console.log('✅ Access denied for User B attempting AI layout triggers.');

    // 5. Stripe Webhook Verification test
    console.log('\nTesting Stripe Webhook Signature enforcement...');
    // Setup production environment variable simulation
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const unsignedWebhookRes = await request('/billing/webhook', {
      method: 'POST',
      body: { type: 'checkout.session.completed' },
    });
    
    // Restore node environment
    process.env.NODE_ENV = originalEnv;

    if (unsignedWebhookRes.status !== 400) {
      throw new Error(`Stripe signature bypass succeeded in production simulation! Got status: ${unsignedWebhookRes.status}`);
    }
    console.log('✅ Stripe webhook signature verified: Unsigned payloads rejected in production.');

    console.log('\n🎉 ALL SECURITY VALIDATION TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ SECURITY VALIDATION TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    // Clean mock tables
    await prisma.user.deleteMany({});
    await prisma.board.deleteMany({});
    console.log('🧹 Security test suite cleanup complete.');
  }
};

runSecurityTests();
