import * as Y from 'yjs';

const runPerformanceBenchmarks = async () => {
  console.log('🚀 Initiating Performance & Benchmarking suite...');

  // 1. Memory footprint benchmark
  const initialMemory = process.memoryUsage().heapUsed;
  console.log(`Initial Heap Memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

  // Create a Yjs document and maps
  const doc = new Y.Doc();
  const elements = doc.getMap('elements');

  console.log('\nStarting Yjs transaction latency test (10,000 updates)...');
  const startTime = Date.now();
  
  doc.transact(() => {
    for (let i = 0; i < 10000; i++) {
      elements.set(`shape-${i}`, {
        type: 'rect',
        left: Math.random() * 1000,
        top: Math.random() * 1000,
        width: 50,
        height: 50,
        fill: '#4f46e5',
        angle: Math.random() * 360,
      });
    }
  });

  const duration = Date.now() - startTime;
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  console.log(`✅ 10,000 operations processed in ${duration}ms`);
  console.log(`Throughput: ${(10000 / (duration / 1000)).toFixed(0)} operations/sec`);
  console.log(`Heap Memory consumed by 10,000 canvas shapes: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);

  // 2. Yjs encoding and state-vector compression test
  console.log('\nBenchmarking Yjs state vector compression...');
  const encodeStart = Date.now();
  const stateUpdate = Y.encodeStateAsUpdate(doc);
  const encodeDuration = Date.now() - encodeStart;
  console.log(`✅ Document state vector encoded in ${encodeDuration}ms`);
  console.log(`Binary size of 10,000 elements: ${(stateUpdate.byteLength / 1024).toFixed(1)} KB`);

  // 3. Canvas rendering loop batch efficiency benchmark
  console.log('\nBenchmarking canvas render loop options...');
  
  // Traditional rendering (simulate 1000 sequential draws each calling render immediately)
  let syncRenders = 0;
  const mockRenderAll = () => {
    syncRenders++;
  };
  
  const startSync = Date.now();
  for (let i = 0; i < 1000; i++) {
    // Immediate draw
    mockRenderAll();
  }
  const syncDuration = Date.now() - startSync;
  console.log(`Unbatched rendering: 1,000 modifications triggered ${syncRenders} render cycles in ${syncDuration}ms`);

  // Batched requestAnimationFrame rendering simulation
  let batchedRenders = 0;
  let renderPending = false;
  
  const requestRender = () => {
    if (!renderPending) {
      renderPending = true;
      // We simulate animation frame resolution by resolving next tick
      setImmediate(() => {
        batchedRenders++;
        renderPending = false;
      });
    }
  };

  const startBatch = Date.now();
  for (let i = 0; i < 1000; i++) {
    requestRender();
  }
  
  // Wait for the scheduled batched renders to resolve
  await new Promise((resolve) => setImmediate(resolve));
  const batchDuration = Date.now() - startBatch;
  
  console.log(`Batched rendering (requestAnimationFrame style): 1,000 modifications triggered ${batchedRenders} render cycle(s) in ${batchDuration}ms`);
  
  const renderSavings = ((1 - (batchedRenders / syncRenders)) * 100).toFixed(1);
  console.log(`🔥 Batching reduced render cycles by ${renderSavings}%!`);

  console.log('\n🎉 ALL PERFORMANCE BENCHMARKS COMPLETED SUCCESSFULLY!');
};

runPerformanceBenchmarks();
