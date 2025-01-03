import type { ClaudeClient } from '../../claude/client.js';
import type { EmbeddingsProvider } from '../../embeddings/base.js';
import { SimpleEmbeddingsProvider } from '../../embeddings/base.js';
import { VectorStore, VectorStoreConfig, createVectorStore, VectorEntry } from './VectorStore.js';

export interface MemoryConfig {
  shortTermLimit: number;
  summarizeInterval: string;
  pruneThreshold: number;
  claude: ClaudeClient;
  embeddings?: EmbeddingsProvider;
  vectorStore?: VectorStoreConfig;
}

export interface MemoryNode {
  id: string;
  type: 'fact' | 'experience' | 'learning' | 'summary';
  content: string;
  timestamp: Date;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  relevance?: number;
  references?: string[];
}

interface TypedMemoryNode extends MemoryNode {
  type: MemoryNode['type'];
}

type MemoryType = MemoryNode['type'];

function isValidMemoryNode(node: unknown): node is MemoryNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'id' in node &&
    'type' in node &&
    'content' in node &&
    'timestamp' in node
  );
}

function hasEmbedding(node: MemoryNode): node is MemoryNode & { embedding: number[] } {
  return Array.isArray(node.embedding) && node.embedding.length > 0;
}

export class Memory {
  private nodes: MemoryNode[] = [];
  private config: MemoryConfig;
  private claude: ClaudeClient;
  private embeddings: EmbeddingsProvider;
  private vectorStore: VectorStore;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.claude = config.claude;
    this.embeddings = config.embeddings ?? new SimpleEmbeddingsProvider();

    // Initialize vector store
    this.vectorStore = createVectorStore(config.vectorStore ?? {
      dimensions: 1536, // Default for embeddings
      similarity: 'cosine',
      backend: 'memory'
    });
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  async store(node: Omit<MemoryNode, 'id' | 'embedding'>): Promise<string> {
    // 1. Generate ID and embedding
    const id = crypto.randomUUID();
    const embedding = await this.embeddings.generateEmbedding(node.content);

    // 2. Create full memory node
    const fullNode: MemoryNode = {
      ...node,
      id,
      embedding
    };
    
    // 3. Store in memory and vector store
    this.nodes.push(fullNode);
    await this.vectorStore.upsert([{
      id,
      vector: embedding,
      metadata: {
        type: node.type,
        timestamp: node.timestamp,
        ...node.metadata
      }
    }]);

    // 4. Check if we need to optimize
    if (this.nodes.length > this.config.shortTermLimit) {
      await this.optimize();
    }

    return id;
  }

  async recall(query: string, options: {
    limit?: number;
    minRelevance?: number;
    type?: MemoryType;
  } = {}): Promise<MemoryNode[]> {
    // 1. Generate query embedding
    const queryEmbedding = await this.embeddings.generateEmbedding(query);

    // 2. Search vector store
    const matches = await this.vectorStore.query({
      vector: queryEmbedding,
      limit: options.limit,
      minSimilarity: options.minRelevance,
      filter: options.type ? {
        type: [options.type]
      } : undefined
    });

    // 3. Map matches back to memory nodes
    return matches.map(match => {
      const node = this.nodes.find(n => n.id === match.id);
      if (!node) {
        throw new Error(`Memory node not found: ${match.id}`);
      }
      return {
        ...node,
        relevance: match.similarity
      };
    });
  }

  async optimize(): Promise<void> {
    if (this.nodes.length === 0) return;

    // 1. Remove irrelevant memories
    await this.pruneIrrelevant();

    // 2. Consolidate similar memories
    await this.consolidateSimilar();

    // 3. Generate summaries
    await this.generateSummaries();
  }

  private async pruneIrrelevant(): Promise<void> {
    if (this.nodes.length === 0) return;

    const prompt = `
Rate the long-term relevance of each memory from 0.0 to 1.0:

${this.nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Return ratings as JSON array of numbers.`;

    const response = await this.claude.complete(prompt);
    let ratings: number[] = [];
    
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.every(r => typeof r === 'number')) {
        ratings = parsed;
      }
    } catch {
      // If parsing fails, keep all nodes
      return;
    }

    if (ratings.length === 0) {
      return;
    }

    // Get IDs of nodes to remove
    const removeIds = this.nodes
      .filter((_, i) => {
        const rating = ratings[i];
        return typeof rating === 'number' && rating < this.config.pruneThreshold;
      })
      .map(n => n.id);

    // Remove from both memory and vector store
    this.nodes = this.nodes.filter(n => !removeIds.includes(n.id));
    await this.vectorStore.delete(removeIds);
  }

  private async consolidateSimilar(): Promise<void> {
    // Find groups of similar memories using vector store
    const groups: MemoryNode[][] = [];
    const processed = new Set<string>();

    for (const node of this.nodes) {
      if (processed.has(node.id) || !hasEmbedding(node)) continue;

      const similar = await this.vectorStore.query({
        vector: node.embedding,
        minSimilarity: 0.8
      });

      if (similar.length > 1) {
        const group = similar.map(match => {
          const node = this.nodes.find(n => n.id === match.id);
          if (!node) {
            throw new Error(`Memory node not found: ${match.id}`);
          }
          processed.add(match.id);
          return node;
        });
        groups.push(group);
      }
    }

    // Merge each group
    for (const group of groups) {
      // 1. Generate merged content
      const mergedContent = await this.mergeNodes(group);
      const mergedEmbedding = await this.embeddings.generateEmbedding(mergedContent);

      // 2. Create consolidated node
      const consolidatedNode: MemoryNode = {
        id: crypto.randomUUID(),
        type: 'summary',
        content: mergedContent,
        timestamp: new Date(),
        embedding: mergedEmbedding,
        references: group.map(n => n.id)
      };

      // 3. Remove old nodes and add consolidated node
      const removeIds = group.map(n => n.id);
      this.nodes = this.nodes.filter(n => !removeIds.includes(n.id));
      await this.vectorStore.delete(removeIds);

      this.nodes.push(consolidatedNode);
      await this.vectorStore.upsert([{
        id: consolidatedNode.id,
        vector: mergedEmbedding,
        metadata: {
          type: consolidatedNode.type,
          timestamp: consolidatedNode.timestamp,
          references: consolidatedNode.references
        }
      }]);
    }
  }

  private async mergeNodes(nodes: MemoryNode[]): Promise<string> {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('Cannot merge empty node list');
    }

    const prompt = `
Merge these related memories into a single coherent memory:

${nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a concise merged version that:
1. Preserves key information
2. Eliminates redundancy
3. Maintains temporal relationships
4. Notes any contradictions
5. Extracts general patterns`;

    return await this.claude.complete(prompt);
  }

  private async generateSummaries(): Promise<void> {
    // Group memories by type
    const byType = new Map<MemoryType, TypedMemoryNode[]>();
    
    // Only process nodes with defined types
    const validNodes = this.nodes.filter((n): n is TypedMemoryNode => 
      isValidMemoryNode(n) && 
      typeof n.type === 'string' &&
      ['fact', 'experience', 'learning', 'summary'].includes(n.type)
    );

    if (validNodes.length === 0) {
      return;
    }

    // Group nodes by type
    for (const node of validNodes) {
      const existingNodes = byType.get(node.type) ?? [];
      const updatedNodes = [...existingNodes, node];
      byType.set(node.type, updatedNodes);
    }

    // Generate summary for each type
    const entries = Array.from(byType.entries());
    for (const [type, typeNodes] of entries) {
      if (!Array.isArray(typeNodes) || typeNodes.length === 0) continue;

      const summary = await this.summarizeNodes(type, typeNodes);
      if (summary) {
        await this.store({
          type: 'summary',
          content: summary,
          timestamp: new Date(),
          metadata: {
            summarizedType: type,
            nodeCount: typeNodes.length
          }
        });
      }
    }
  }

  private async summarizeNodes(
    type: MemoryType,
    nodes: MemoryNode[]
  ): Promise<string | null> {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return null;
    }

    const prompt = `
Summarize these ${type} memories:

${nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a high-level summary that:
1. Captures key patterns and trends
2. Notes important exceptions
3. Preserves critical details
4. Highlights valuable learnings`;

    return await this.claude.complete(prompt);
  }
}
