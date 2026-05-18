import axios from 'axios';
import config from '../../../config/index.js';

class OpenMemoryClient {
  constructor() {
    this.enabled = config.openMemory.enabled;
    this.http = axios.create({
      baseURL: config.openMemory.baseUrl,
      timeout: config.openMemory.timeoutMs,
      headers: config.openMemory.apiKey
        ? { Authorization: `Bearer ${config.openMemory.apiKey}` }
        : {},
    });
  }

  async addMemory({
    content,
    userId,
    tags = [],
    metadata = {},
    sector = 'semantic',
  }) {
    if (!this.enabled || !content) return null;
    const payload = {
      content,
      user_id: userId,
      tags,
      metadata: { ...metadata, sector },
    };
    const { data } = await this.http.post('/memory/add', payload);
    return data;
  }

  async queryMemories({
    query,
    userId,
    k = config.openMemory.defaultTopK,
    filters = {},
  }) {
    if (!this.enabled || !query) return [];
    const payload = {
      query,
      k,
      filters: { user_id: userId, ...filters },
    };
    const { data } = await this.http.post('/memory/query', payload);
    return data?.matches || [];
  }

  async reinforceMemory(memoryId, boost = 0.2) {
    if (!this.enabled || !memoryId) return;
    await this.http.post('/memory/reinforce', { id: memoryId, boost });
  }
}

export const openMemoryClient = new OpenMemoryClient();
