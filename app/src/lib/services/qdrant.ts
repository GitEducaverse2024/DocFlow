const QDRANT_URL = process.env.QDRANT_URL || 'http://192.168.1.49:6333';

export const qdrant = {
  async healthCheck() {
    try {
      const res = await fetch(`${QDRANT_URL}/collections`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async createCollection(name: string, vectorSize: number) {
    const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      })
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.status?.error || 'Error creating collection');
    }
    return res.json();
  },

  async deleteCollection(name: string) {
    const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
      method: 'DELETE'
    });
    
    if (!res.ok && res.status !== 404) {
      const error = await res.json();
      throw new Error(error.status?.error || 'Error deleting collection');
    }
    return res.ok;
  },

  async getCollectionInfo(name: string) {
    const res = await fetch(`${QDRANT_URL}/collections/${name}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error('Error fetching collection info');
    }
    return res.json();
  },

  async upsertPoints(name: string, points: unknown[]) {
    const res = await fetch(`${QDRANT_URL}/collections/${name}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.status?.error || 'Error upserting points');
    }
    return res.json();
  },

  async search(name: string, vector: number[], limit: number = 5) {
    const res = await fetch(`${QDRANT_URL}/collections/${name}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true
      })
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.status?.error || 'Error searching points');
    }
    return res.json();
  }
};
