# Context Management System

## Overview

The Context Management System is responsible for:
- Maintaining agent working memory
- Summarizing and pruning context
- Sharing relevant context between agents
- Optimizing context for LLM token limits

## Core Components

### 1. Context Store

```typescript
interface ContextConfig {
  maxTokens: number;
  summarizeThreshold: number;
  pruneThreshold: number;
  retentionPeriod: Duration;
}

class ContextStore {
  private nodes: ContextNode[] = [];
  private summaries: Map<string, ContextSummary> = new Map();
  private config: ContextConfig;
  private claude: ClaudeClient;

  constructor(config: ContextConfig, claude: ClaudeClient) {
    this.config = config;
    this.claude = claude;
  }

  async add(node: ContextNode): Promise<void> {
    // 1. Add new node
    this.nodes.push(node);
    
    // 2. Check token limit
    const totalTokens = await this.calculateTokens();
    if (totalTokens > this.config.maxTokens * this.config.summarizeThreshold) {
      await this.summarizeOldest();
    }
    
    // 3. Update relevance scores
    await this.updateRelevance();
  }

  private async summarizeOldest(): Promise<void> {
    // 1. Identify summarization candidates
    const candidates = this.findSummarizationCandidates();
    
    // 2. Group related nodes
    const groups = this.groupRelatedNodes(candidates);
    
    // 3. Summarize each group
    for (const group of groups) {
      const summary = await this.createSummary(group);
      this.replaceSummarizedNodes(group, summary);
    }
  }

  private async createSummary(nodes: ContextNode[]): Promise<ContextSummary> {
    const prompt = `
Summarize these related context nodes while preserving key information:

${nodes.map(n => n.content).join('\n---\n')}

Create a concise summary that:
1. Captures main decisions and outcomes
2. Preserves important context
3. Maintains action sequences
4. Notes any critical warnings or errors

Format the summary to be easily understood when referenced later.
`;

    const summaryContent = await this.claude.complete(prompt);
    return {
      type: 'summary',
      content: summaryContent,
      originalNodes: nodes.map(n => n.id),
      timestamp: new Date(),
      tokens: await this.claude.countTokens(summaryContent)
    };
  }
}
```

### 2. Context Analysis

```typescript
class ContextAnalyzer {
  private claude: ClaudeClient;

  async analyzeContext(nodes: ContextNode[]): Promise<ContextAnalysis> {
    const prompt = `
Analyze these context nodes and extract key information:

${nodes.map(n => n.content).join('\n---\n')}

Provide analysis in this JSON format:
{
  "currentGoal": "string - active goal being pursued",
  "subgoals": ["string[] - list of pending subgoals"],
  "progress": {
    "completed": ["string[] - completed items"],
    "inProgress": ["string[] - items being worked on"],
    "blocked": ["string[] - blocked items with reasons"]
  },
  "decisions": [{
    "decision": "string - what was decided",
    "rationale": "string - why it was decided",
    "impact": "string - expected impact"
  }],
  "keyInsights": ["string[] - important learnings"],
  "risks": ["string[] - identified risks or issues"]
}
`;

    const analysis = await this.claude.complete(prompt);
    return JSON.parse(analysis);
  }

  async calculateRelevance(
    node: ContextNode,
    currentGoal: string
  ): Promise<number> {
    const prompt = `
Given this context node:
${node.content}

And the current goal:
${currentGoal}

Rate the relevance from 0.0 to 1.0 where:
- 1.0: Directly relevant to current goal
- 0.7: Important background/context
- 0.4: Might be useful later
- 0.1: Mostly irrelevant

Explain your rating.
`;

    const response = await this.claude.complete(prompt);
    const match = response.match(/Rating: (0\.\d+)/);
    return match ? parseFloat(match[1]) : 0.1;
  }
}
```

### 3. Context Sharing

```typescript
class ContextSharer {
  async createSharedContext(
    source: ContextStore,
    recipient: Agent,
    task: Task
  ): Promise<SharedContext> {
    // 1. Analyze task requirements
    const requirements = await this.analyzeTaskRequirements(task);
    
    // 2. Select relevant context
    const relevantNodes = await this.selectRelevantNodes(
      source,
      requirements
    );
    
    // 3. Create focused summary
    const summary = await this.createFocusedSummary(
      relevantNodes,
      requirements
    );
    
    // 4. Add task constraints
    const constraints = await this.extractConstraints(
      relevantNodes,
      task
    );

    return {
      summary,
      relevantNodes,
      constraints,
      metadata: {
        task: task.id,
        timestamp: new Date(),
        source: source.id,
        recipient: recipient.id
      }
    };
  }

  private async createFocusedSummary(
    nodes: ContextNode[],
    requirements: TaskRequirements
  ): Promise<string> {
    const prompt = `
Create a focused summary of this context for a task with these requirements:
${JSON.stringify(requirements, null, 2)}

Context nodes:
${nodes.map(n => n.content).join('\n---\n')}

Create a summary that:
1. Focuses on information relevant to the task
2. Provides necessary background
3. Highlights important constraints
4. Notes relevant decisions
5. Warns about potential issues

Keep the summary concise but include all critical information.
`;

    return await this.claude.complete(prompt);
  }
}
```

### 4. Context Threading

```typescript
class ContextThread {
  id: string;
  nodes: ContextNode[] = [];
  status: 'active' | 'completed' | 'archived' = 'active';
  
  async addNode(node: ContextNode): Promise<void> {
    this.nodes.push(node);
    await this.updateThread();
  }

  private async updateThread(): Promise<void> {
    // 1. Check completion
    if (await this.isThreadComplete()) {
      this.status = 'completed';
      await this.summarizeThread();
    }
    
    // 2. Update references
    await this.updateNodeReferences();
    
    // 3. Maintain thread coherence
    await this.ensureCoherence();
  }

  private async summarizeThread(): Promise<void> {
    const prompt = `
Summarize this completed conversation/action thread:
${this.nodes.map(n => n.content).join('\n')}

Create a summary that captures:
1. Initial goal/question
2. Key discussion points
3. Decisions made
4. Final outcome
5. Any important caveats or follow-ups

Make the summary self-contained and useful for future reference.
`;

    const summary = await this.claude.complete(prompt);
    this.summary = {
      type: 'thread_summary',
      content: summary,
      threadId: this.id,
      nodeCount: this.nodes.length,
      timestamp: new Date()
    };
  }
}
```

### 5. Context Optimization

```typescript
class ContextOptimizer {
  async optimize(
    context: ContextStore,
    config: OptimizationConfig
  ): Promise<void> {
    // 1. Analyze context structure
    const analysis = await this.analyzeContext(context);
    
    // 2. Identify optimization opportunities
    const opportunities = this.findOptimizationTargets(analysis);
    
    // 3. Apply optimizations
    for (const opportunity of opportunities) {
      await this.applyOptimization(context, opportunity);
    }
  }

  private async applyOptimization(
    context: ContextStore,
    opportunity: OptimizationOpportunity
  ): Promise<void> {
    switch (opportunity.type) {
      case 'merge_similar':
        await this.mergeSimilarNodes(context, opportunity);
        break;
      case 'compress_thread':
        await this.compressThread(context, opportunity);
        break;
      case 'remove_redundant':
        await this.removeRedundant(context, opportunity);
        break;
      case 'archive_old':
        await this.archiveOld(context, opportunity);
        break;
    }
  }

  private async mergeSimilarNodes(
    context: ContextStore,
    opportunity: MergeOpportunity
  ): Promise<void> {
    const prompt = `
Merge these similar context nodes into a single coherent node:
${opportunity.nodes.map(n => n.content).join('\n---\n')}

Requirements:
1. Combine overlapping information
2. Preserve unique details
3. Maintain chronological order where relevant
4. Note any conflicts or discrepancies
5. Create clear, concise result

The merged content should be complete and self-contained.
`;

    const mergedContent = await this.claude.complete(prompt);
    await context.replaceNodes(opportunity.nodes, {
      type: 'merged',
      content: mergedContent,
      originalNodes: opportunity.nodes.map(n => n.id),
      timestamp: new Date()
    });
  }
}
```

## Usage Example

```typescript
// Initialize context system
const contextSystem = new ContextSystem({
  maxTokens: 100000,
  summarizeThreshold: 0.8,
  pruneThreshold: 0.3,
  retentionPeriod: Duration.days(7)
});

// Create agent context
const agentContext = await contextSystem.createContext({
  agent: 'developer',
  role: 'Implementing features and writing code',
  baseTokens: 4000
});

// Add thought to context
await agentContext.add({
  type: 'thought',
  content: 'Need to implement the user authentication system',
  timestamp: new Date()
});

// Execute action and add result
const result = await agent.executeAction('implement_auth');
await agentContext.add({
  type: 'action',
  action: 'implement_auth',
  result: result,
  timestamp: new Date()
});

// Share context with another agent
const sharedContext = await contextSystem.shareContext({
  source: agentContext,
  recipient: reviewerAgent,
  task: {
    type: 'code_review',
    files: ['auth.ts']
  }
});

// Optimize context periodically
await contextSystem.optimize(agentContext);
```

## Next Steps

1. Implement core context classes
2. Add context persistence
3. Build context analysis system
4. Create context sharing mechanism
5. Add context optimization
6. Develop testing suite

Would you like me to create the implementation document for another component?
