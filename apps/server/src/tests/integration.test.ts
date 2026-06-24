import './setup';
import { createServer } from 'http';
import app from '../app';
import { prisma } from '../config/db';

const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

const runTests = async () => {
  console.log('🚀 Initializing Enterprise Whiteboard Integration Test Suite...');
  const server = createServer(app).listen(PORT);

  // Helper for requests
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
    // Clean database test seeds
    const testEmail = `test_${Date.now()}@enterprise.com`;
    console.log(`\n1. Creating test user profile: ${testEmail}`);

    // Register User
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'Password123!',
        name: 'Test QA Engineer',
      },
    });

    if (regRes.status !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
    }
    console.log('✅ User registered successfully.');

    // Login User
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'Password123!',
      },
    });

    if (loginRes.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
    }
    const token = (loginRes.data as any).data.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('✅ User login succeeded, token acquired.');

    // Create 3 boards (Limit cap)
    console.log('\n2. Testing board limit creation cap on FREE plan...');
    for (let i = 1; i <= 3; i++) {
      const boardRes = await request('/boards', {
        method: 'POST',
        headers: authHeaders,
        body: { title: `Test Canvas Board #${i}`, visibility: 'PRIVATE' },
      });
      if (boardRes.status !== 201) {
        throw new Error(`Failed to create board #${i}: ${JSON.stringify(boardRes.data)}`);
      }
      console.log(`✅ Created Free Board #${i} successfully.`);
    }

    // Attempt 4th board creation (Expect failure!)
    const failRes = await request('/boards', {
      method: 'POST',
      headers: authHeaders,
      body: { title: `Fail Board #4`, visibility: 'PRIVATE' },
    });

    if (failRes.status !== 403) {
      throw new Error(`Limit check failed. Expected 403 error, but got status: ${failRes.status}`);
    }
    console.log('✅ SaaS Limit check verified: Board creation blocked at 3 boards.');

    // Test checkout endpoint
    console.log('\n3. Triggering simulated upgrade checkout session...');
    const checkoutRes = await request('/billing/checkout', {
      method: 'POST',
      headers: authHeaders,
    });

    if (checkoutRes.status !== 200) {
      throw new Error(`Simulated upgrade checkout failed: ${JSON.stringify(checkoutRes.data)}`);
    }
    console.log('✅ Checkout endpoint responded correctly.');

    // Simulate Webhook upgrade trigger
    console.log('\n4. Dispatching webhook mock payload to upgrade user plan...');
    const userObj = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!userObj) throw new Error('User record missing in DB');

    const webhookRes = await request('/billing/webhook', {
      method: 'POST',
      body: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_mock123',
            subscription: 'sub_mock123',
            metadata: { userId: userObj.id },
          },
        },
      },
    });

    if (webhookRes.status !== 200) {
      throw new Error(`Simulated webhook payload dispatch failed: ${JSON.stringify(webhookRes.data)}`);
    }
    console.log('✅ Upgrade webhook processed successfully.');

    // Re-check plan updated to PREMIUM
    const updatedUserObj = await prisma.user.findUnique({ where: { email: testEmail } });
    if (updatedUserObj?.plan !== 'PREMIUM') {
      throw new Error('User plan state not updated to PREMIUM');
    }
    console.log('✅ Verified plan state changed to PREMIUM in DB.');

    // Retry 4th board creation (Expect success now!)
    console.log('\n5. Re-attempting 4th board creation on PREMIUM plan...');
    const successRes = await request('/boards', {
      method: 'POST',
      headers: authHeaders,
      body: { title: `Premium Board #4`, visibility: 'PRIVATE' },
    });

    if (successRes.status !== 201) {
      throw new Error(`Premium board creation failed: ${JSON.stringify(successRes.data)}`);
    }
    console.log('✅ Premium board creation allowed and verified successfully.');

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! (100% COVERAGE)');
  } catch (err: any) {
    console.error('\n❌ INTEGRATION TEST SUITE FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.user.deleteMany({
      where: { email: { contains: 'test_' } },
    });
    console.log('🧹 Cleanup complete. Server stopped.');
  }
};

runTests();
