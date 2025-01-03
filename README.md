# Autonomous Agents Framework

A TypeScript framework for building autonomous software agents powered by Claude AI.

## Project Structure

```
.
├── src/
│   └── agents/
│       ├── base/           # Base agent implementations
│       │   ├── Agent.ts    # Base agent class
│       │   ├── Context.ts  # Context management
│       │   ├── Memory.ts   # Memory system
│       │   └── VectorStore.ts
│       ├── Coder.ts        # Code generation agent
│       └── ProjectManager.ts# Project management agent
└── demo/                   # Demo implementation
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your Claude API key:
```
CLAUDE_API_KEY=your-api-key
```

3. Build the project:
```bash
npm run build
```

## Development

Run in watch mode:
```bash
npm run dev
```

See the `demo/` directory for example implementations and usage.

## Documentation

- [Autonomous Agents](AUTONOMOUS-AGENTS.md)
- [Claude Integration](CLAUDE-INTEGRATION.md)
- [Context Management](CONTEXT-MANAGEMENT.md)
- [Memory System](MEMORY-SYSTEM.md)
- [Project Setup](PROJECT-SETUP.md)
