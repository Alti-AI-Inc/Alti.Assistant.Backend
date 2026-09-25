import { logger } from '../../../shared/logger.js';
import v8 from 'v8';
import os from 'os';

export const MemoryProfilerService = {
  start() {
    logger.info(`[V8 Profiler] Initializing bare-metal heap monitoring...`);
    
    setInterval(() => {
      const heap = v8.getHeapStatistics();
      const usagePercent = (heap.used_heap_size / heap.heap_size_limit) * 100;
      
      if (usagePercent > 85) {
        logger.warn(`[V8 Profiler] ⚠️ CRITICAL MEMORY PRESSURE: Node heap at ${usagePercent.toFixed(2)}%. Triggering aggressive Garbage Collection...`);
        if (global.gc) {
          global.gc();
        } else {
          logger.warn(`[V8 Profiler] ⚠️ Node must be run with --expose-gc to force cleanup.`);
        }
      }
      
      logger.info(`[V8 Profiler] Node Heap: ${(heap.used_heap_size / 1024 / 1024).toFixed(2)}MB / LCO Host RAM: ${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)}GB`);
    }, 60000); // Check every 60s
  }
};
