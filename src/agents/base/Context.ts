import type { ClaudeClient } from '../../claude/client.js';
import type { EmbeddingsProvider } from '../../embeddings/base.js';
import { SimpleEmbeddingsProvider } from '../../embeddings/base.js';
import { VectorStore, VectorStoreConfig, createVectorStore, VectorMatch } from './VectorStore.js';

export interface ContextConfig {
  maxTokens: number;
  claude: ClaudeClient;
  embeddings?: EmbeddingsProvider;
  vectorStore?: VectorStoreConfig;
}

export interface ContextNode {
  id: string;
  type: 'thought' | 'action' | 'result' | 'communication' | 'summary';
  content: string;
  timestamp: Date;
  threadId?: string;
  parentId?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  relevance?: number;
  references?: string[];
}

interface ThreadBase {
  id: string;
  status: 'active' | 'completed' | 'archived';
  nodes: ContextNode[];  // Always initialized as an array
  metadata?: Record<string, unknown>;
}

interface ThreadWithoutSummary extends ThreadBase {
  summary: undefined;
}

interface ThreadWithSummary extends ThreadBase {
  summary: string;
}

type ContextThread = ThreadWithoutSummary | ThreadWithSummary;

// Ensure all threads have nodes initialized
function createEmptyThread(id: string, status: ThreadBase['status']): ThreadWithoutSummary {
  return {
    id,
    nodes: [],
    status,
    summary: undefined
  };
}

function isThreadWithSummary(thread: ContextThread): thread is ThreadWithSummary {
  return thread.summary !== undefined;
}

function hasValidSummary(thread: ContextThread): thread is ThreadWithSummary {
  const summary = thread.summary;
  return summary !== undefined && typeof summary === 'string' && summary.length > 0;
}

function assertThreadWithSummary(thread: ContextThread): asserts thread is ThreadWithSummary {
  if (!hasValidSummary(thread)) {
    throw new Error('Thread does not have a valid summary');
  }
}

function isValidContextNode(node: unknown): node is ContextNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'id' in node &&
    'type' in node &&
    'content' in node &&
    'timestamp' in node
  );
}

function hasEmbedding(node: ContextNode): node is ContextNode & { embedding: number[] } {
  return Array.isArray(node.embedding) && node.embedding.length > 0;
}

function isValidSummary(summary: unknown): summary is string {
  return typeof summary === 'string' && summary.length > 0;
}

function isValidThread(thread: unknown): thread is ContextThread {
  if (
    typeof thread === 'object' &&
    thread !== null &&
    'id' in thread &&
    'status' in thread &&
    'nodes' in thread &&
    Array.isArray((thread as any).nodes)
  ) {
    const t = thread as any;
    const validStatus = ['active', 'completed', 'archived'].includes(t.status);
    return validStatus && t.nodes.every(isValidContextNode);
  }
  return false;
}

export class Context {
  private nodes: ContextNode[] = [];
  private threads: Map<string, ContextThread> = new Map();
  private summaries: Map<string, string> = new Map();
  private config: ContextConfig;
  private claude: ClaudeClient;
  private embeddings: EmbeddingsProvider;
  private vectorStore: VectorStore;

  constructor(config: ContextConfig) {
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

  async add(node: Omit<ContextNode, 'id' | 'embedding'>): Promise<string> {
    // 1. Generate ID and embedding
    const id = crypto.randomUUID();
    const embedding = await this.embeddings.generateEmbedding(node.content);

    // 2. Create full context node
    const fullNode: ContextNode = {
      ...node,
      id,
      embedding
    };

    // 3. Store node
    this.nodes.push(fullNode);
    await this.vectorStore.upsert([{
      id,
      vector: embedding,
      metadata: {
        type: node.type,
        timestamp: node.timestamp,
        threadId: node.threadId,
        parentId: node.parentId,
        ...node.metadata
      }
    }]);

    // 4. Update thread if part of one
    if (node.threadId) {
      await this.updateThread(node.threadId, fullNode);
    }

    // 5. Check if we need to summarize
    if (await this.shouldSummarize()) {
      await this.summarizeOldest();
    }

    return id;
  }

  async createThread(metadata?: Record<string, unknown>): Promise<string> {
    const id = crypto.randomUUID();
    const thread: ThreadWithoutSummary = {
      id,
      nodes: [],
      summary: undefined,
      status: 'active',
      ...(metadata ? { metadata } : {})
    };
    this.threads.set(id, thread);
    return id;
  }

  private async updateThread(threadId: string, node: ContextNode): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    if (!isValidThread(thread)) {
      throw new Error('Invalid thread: missing required properties');
    }

    // After type guard, we know thread is a valid ContextThread with nodes
    const nodes = thread.nodes ?? [];

    // Create thread with required properties
    const updatedThread: ThreadWithoutSummary = {
      id: thread.id,
      nodes: [...nodes, node],
      status: thread.status === 'active' ? 'active' : thread.status === 'completed' ? 'completed' : 'archived',
      summary: undefined,
      metadata: thread.metadata ? { ...thread.metadata } : undefined
    };

    // Check if thread is complete
    if (await this.isThreadComplete(updatedThread)) {
      const summary = await this.summarizeThread(updatedThread);
      
      // Create completed thread with required properties
      const completedThread = {
        ...updatedThread,
        status: 'completed' as const,
        summary
      } satisfies ThreadWithSummary;

      this.threads.set(threadId, completedThread);
    } else {
      this.threads.set(threadId, updatedThread);
    }
  }

  private async isThreadComplete(thread: ContextThread): Promise<boolean> {
    const prompt = `
Analyze this conversation/action thread to determine if it's complete:

${thread.nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Consider:
1. Has the initial goal/question been addressed?
2. Are there any pending actions or questions?
3. Has a conclusion been reached?
4. Are there any unresolved issues?

Return "true" if complete, "false" if not.`;

    const response = await this.claude.complete(prompt);
    return response.trim().toLowerCase() === 'true';
  }

  private async summarizeThread(thread: ContextThread): Promise<string> {
    const prompt = `
Summarize this completed conversation/action thread:

${thread.nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a summary that captures:
1. Initial goal/question
2. Key discussion points
3. Decisions made
4. Final outcome
5. Any important caveats or follow-ups

Make the summary self-contained and useful for future reference.`;

    return await this.claude.complete(prompt);
  }

  async getSummary(): Promise<string> {
    const prompt = `
Summarize this context while preserving key information:

${this.nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Focus on:
1. Current goals and progress
2. Important decisions and their rationale
3. Recent actions and their results
4. Any blockers or issues
5. Key insights or learnings
6. Active conversation threads

Keep the summary concise but include all critical information.`;

    const summary = await this.claude.complete(prompt);
    return summary;
  }

  async optimize(): Promise<void> {
    // 1. Remove irrelevant nodes
    await this.pruneIrrelevant();
    
    // 2. Consolidate similar nodes
    await this.consolidateSimilar();
    
    // 3. Archive completed threads
    await this.archiveThreads();
    
    // 4. Update summaries
    await this.updateSummaries();
  }

  private async shouldSummarize(): Promise<boolean> {
    // Estimate token count (rough approximation)
    const totalTokens = this.nodes.reduce(
      (sum, node) => sum + node.content.length / 4,
      0
    );
    
    return totalTokens > this.config.maxTokens * 0.8;
  }

  private async summarizeOldest(): Promise<void> {
    // Find oldest nodes that can be summarized
    const oldestNodes = this.nodes
      .slice(0, Math.floor(this.nodes.length / 2))
      // Don't summarize nodes from active threads
      .filter(n => {
        if (!n.threadId) return true;
        const thread = this.threads.get(n.threadId);
        return !thread || thread.status !== 'active';
      });
    
    const prompt = `
Summarize these context nodes while preserving key information:

${oldestNodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a concise summary that captures:
1. Main points and decisions
2. Important outcomes
3. Relevant context for future reference`;

    const summary = await this.claude.complete(prompt);
    const summaryEmbedding = await this.embeddings.generateEmbedding(summary);
    
    // Replace old nodes with summary
    const summaryNode: ContextNode = {
      id: crypto.randomUUID(),
      type: 'summary',
      content: summary,
      timestamp: new Date(),
      embedding: summaryEmbedding,
      references: oldestNodes.map(n => n.id)
    };

    // Update storage
    const removeIds = oldestNodes.map(n => n.id);
    this.nodes = this.nodes.filter(n => !removeIds.includes(n.id));
    await this.vectorStore.delete(removeIds);

    this.nodes.push(summaryNode);
    await this.vectorStore.upsert([{
      id: summaryNode.id,
      vector: summaryEmbedding,
      metadata: {
        type: summaryNode.type,
        timestamp: summaryNode.timestamp,
        references: summaryNode.references
      }
    }]);
  }

  private async pruneIrrelevant(): Promise<void> {
    const prompt = `
Rate the relevance of each context node from 0.0 to 1.0:

${this.nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Return ratings as JSON array of numbers.`;

    const response = await this.claude.complete(prompt);
    const ratings = JSON.parse(response) as number[];
    
    // Get IDs of nodes to remove
    const removeIds = this.nodes
      .filter((_, i) => ratings[i] <= 0.3)
      // Don't remove nodes from active threads
      .filter(n => {
        if (!n.threadId) return true;
        const thread = this.threads.get(n.threadId);
        return !thread || thread.status !== 'active';
      })
      .map(n => n.id);

    // Remove from both context and vector store
    this.nodes = this.nodes.filter(n => !removeIds.includes(n.id));
    await this.vectorStore.delete(removeIds);
  }

  private async consolidateSimilar(): Promise<void> {
    // Find groups of similar nodes using vector store
    const groups: ContextNode[][] = [];
    const processed = new Set<string>();

    for (const node of this.nodes) {
      if (
        processed.has(node.id) ||
        !hasEmbedding(node) ||
        // Don't consolidate nodes from active threads
        (node.threadId && (() => {
          const thread = this.threads.get(node.threadId!);
          return thread && thread.status === 'active';
        })())
      ) {
        continue;
      }

      // At this point, TypeScript knows node.embedding is defined due to hasEmbedding guard
      const similar = await this.vectorStore.query({
        vector: node.embedding,
        minSimilarity: 0.8
      });

      if (similar.length > 1) {
        const similarNodes = similar
          .filter((match: VectorMatch): match is VectorMatch & { id: string } => 
            typeof match.id === 'string'
          )
          .map(match => this.nodes.find(n => n.id === match.id))
          .filter((n): n is ContextNode => n !== undefined);

        if (similarNodes.length > 1) {
          groups.push(similarNodes);
          similarNodes.forEach(n => processed.add(n.id));
        }
      }
    }

    // Merge each group
    for (const group of groups) {
      const mergedContent = await this.mergeNodes(group);
      const mergedEmbedding = await this.embeddings.generateEmbedding(mergedContent);

      const consolidatedNode: ContextNode = {
        id: crypto.randomUUID(),
        type: 'summary',
        content: mergedContent,
        timestamp: new Date(),
        embedding: mergedEmbedding,
        references: group.map(n => n.id)
      };

      // Update storage
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

  private async archiveThreads(): Promise<void> {
    for (const originalThread of this.threads.values()) {
      if (originalThread.status === 'completed') {
        // Create base thread properties
        const baseProps = {
          id: originalThread.id,
          nodes: [...originalThread.nodes],
          status: 'archived' as const
        };

        // Create metadata if it exists
        const metadataProps = originalThread.metadata 
          ? { metadata: { ...originalThread.metadata } }
          : {};

        // Create archived thread
        const archivedThread: ContextThread = isThreadWithSummary(originalThread)
          ? {
              ...baseProps,
              ...metadataProps,
              summary: originalThread.summary
            }
          : {
              ...baseProps,
              ...metadataProps,
              summary: undefined
            };

        // Store the thread
        this.threads.set(archivedThread.id, archivedThread);

        // Get or create thread summary
        const threadSummary = isThreadWithSummary(archivedThread)
          ? archivedThread.summary
          : await (async () => {
              const newSummary = await this.summarizeThread(archivedThread);
              const updatedThread: ThreadWithSummary = {
                id: archivedThread.id,
                nodes: archivedThread.nodes,
                status: archivedThread.status,
                metadata: archivedThread.metadata ? { ...archivedThread.metadata } : undefined,
                summary: newSummary
              };
              this.threads.set(updatedThread.id, updatedThread);
              return newSummary;
            })();

        // Create base metadata for summary node
        const summaryMetadata: Record<string, unknown> = {
          threadId: archivedThread.id,
          type: 'thread_summary'
        };

        // Add thread metadata if it exists
        if (archivedThread.metadata) {
          Object.assign(summaryMetadata, archivedThread.metadata);
        }

        // Create summary node
        const summaryNode: Omit<ContextNode, 'id' | 'embedding'> = {
          type: 'summary',
          content: threadSummary,
          timestamp: new Date(),
          metadata: summaryMetadata
        };

        // Add summary node
        await this.add(summaryNode);
      }
    }
  }

  private async mergeNodes(nodes: ContextNode[]): Promise<string> {
    const prompt = `
Merge these similar context nodes into a single coherent summary:

${nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a concise merged version that:
1. Preserves key information
2. Eliminates redundancy
3. Maintains temporal relationships
4. Notes any contradictions
5. Extracts general patterns`;

    return await this.claude.complete(prompt);
  }

  private async updateSummaries(): Promise<void> {
    // Update running summaries periodically
    const chunks = this.chunkNodes(10);
    
    for (const [key, nodes] of chunks) {
      const summary = await this.summarizeChunk(nodes);
      this.summaries.set(key, summary);
    }
  }

  private chunkNodes(size: number): Map<string, ContextNode[]> {
    const chunks = new Map<string, ContextNode[]>();
    
    for (let i = 0; i < this.nodes.length; i += size) {
      const chunk = this.nodes.slice(i, i + size);
      const key = `chunk-${i / size}`;
      chunks.set(key, chunk);
    }
    
    return chunks;
  }

  private async summarizeChunk(nodes: ContextNode[]): Promise<string> {
    const prompt = `
Summarize this chunk of context:

${nodes.map(n => `[${n.type}] ${n.content}`).join('\n\n')}

Create a brief summary that:
1. Captures key points and decisions
2. Notes important actions and outcomes
3. Preserves critical context
4. Highlights valuable insights`;

    return await this.claude.complete(prompt);
  }
}
