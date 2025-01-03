import type { MemoryNode } from './Memory.js';

export interface VectorStoreConfig {
  dimensions: number;
  similarity: 'cosine' | 'euclidean' | 'dot';
  backend: 'memory' | 'pinecone' | 'weaviate' | 'postgres';
  connectionString?: string;
  apiKey?: string;
  namespace?: string;
}

export interface VectorQuery {
  vector: number[];
  limit?: number;
  minSimilarity?: number;
  filter?: {
    type?: string[];
    timeRange?: {
      start: Date;
      end: Date;
    };
    metadata?: Record<string, unknown>;
  };
}

export interface VectorMatch {
  id: string;
  similarity: number;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export abstract class VectorStore {
  protected config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract upsert(entries: VectorEntry[]): Promise<void>;
  abstract query(query: VectorQuery): Promise<VectorMatch[]>;
  abstract delete(ids: string[]): Promise<void>;
  abstract clear(): Promise<void>;
}

export class MemoryVectorStore extends VectorStore {
  private vectors: Map<string, VectorEntry> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory store
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.vector.length !== this.config.dimensions) {
        throw new Error(
          `Vector dimensions mismatch. Expected ${this.config.dimensions}, got ${entry.vector.length}`
        );
      }
      this.vectors.set(entry.id, entry);
    }
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    if (query.vector.length !== this.config.dimensions) {
      throw new Error(
        `Query vector dimensions mismatch. Expected ${this.config.dimensions}, got ${query.vector.length}`
      );
    }

    const entries = Array.from(this.vectors.values());
    const matches: VectorMatch[] = [];

    for (const entry of entries) {
      // Apply filters
      if (query.filter) {
        if (query.filter.type && !query.filter.type.includes(entry.metadata.type as string)) {
          continue;
        }

        if (query.filter.timeRange) {
          const timestamp = entry.metadata.timestamp as Date;
          if (
            timestamp < query.filter.timeRange.start ||
            timestamp > query.filter.timeRange.end
          ) {
            continue;
          }
        }

        if (query.filter.metadata) {
          const matches = Object.entries(query.filter.metadata).every(
            ([key, value]) => entry.metadata[key] === value
          );
          if (!matches) continue;
        }
      }

      // Calculate similarity
      const similarity = this.calculateSimilarity(query.vector, entry.vector);

      if (!query.minSimilarity || similarity >= query.minSimilarity) {
        matches.push({
          id: entry.id,
          similarity,
          vector: entry.vector,
          metadata: entry.metadata
        });
      }
    }

    // Sort by similarity and apply limit
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, query.limit);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  private calculateSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match for similarity calculation');
    }

    switch (this.config.similarity) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return this.euclideanSimilarity(a, b);
      case 'dot':
        return this.dotSimilarity(a, b);
      default:
        throw new Error(`Unknown similarity metric: ${this.config.similarity}`);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i];
      const valB = b[i];
      if (typeof valA !== 'number' || typeof valB !== 'number') {
        throw new Error(`Invalid vector values at index ${i}`);
      }
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  private euclideanSimilarity(a: number[], b: number[]): number {
    let sumSquaredDiff = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i];
      const valB = b[i];
      if (typeof valA !== 'number' || typeof valB !== 'number') {
        throw new Error(`Invalid vector values at index ${i}`);
      }
      const diff = valA - valB;
      sumSquaredDiff += diff * diff;
    }

    const distance = Math.sqrt(sumSquaredDiff);
    // Convert distance to similarity (1 / (1 + distance))
    return 1 / (1 + distance);
  }

  private dotSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i];
      const valB = b[i];
      if (typeof valA !== 'number' || typeof valB !== 'number') {
        throw new Error(`Invalid vector values at index ${i}`);
      }
      dotProduct += valA * valB;
    }

    return dotProduct;
  }
}

export class PineconeVectorStore extends VectorStore {
  // Implement Pinecone integration
  async initialize(): Promise<void> {
    throw new Error('Not implemented');
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    throw new Error('Not implemented');
  }

  async delete(ids: string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }
}

export class WeaviateVectorStore extends VectorStore {
  // Implement Weaviate integration
  async initialize(): Promise<void> {
    throw new Error('Not implemented');
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    throw new Error('Not implemented');
  }

  async delete(ids: string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }
}

export class PostgresVectorStore extends VectorStore {
  // Implement Postgres integration with pgvector
  async initialize(): Promise<void> {
    throw new Error('Not implemented');
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    throw new Error('Not implemented');
  }

  async delete(ids: string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }
}

export function createVectorStore(config: VectorStoreConfig): VectorStore {
  switch (config.backend) {
    case 'memory':
      return new MemoryVectorStore(config);
    case 'pinecone':
      return new PineconeVectorStore(config);
    case 'weaviate':
      return new WeaviateVectorStore(config);
    case 'postgres':
      return new PostgresVectorStore(config);
    default:
      throw new Error(`Unknown vector store backend: ${config.backend}`);
  }
}
