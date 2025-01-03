# Project Setup Guide

## Overview

This document provides instructions for setting up the autonomous agent development environment, including:
- Project structure
- Dependencies
- Configuration
- Development workflow
- Testing setup
- Deployment guidelines

## Project Structure

```
autonomous-agents/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── agents/           # Agent implementations
│   │   ├── base/
│   │   │   ├── Agent.ts
│   │   │   ├── Context.ts
│   │   │   └── Memory.ts
│   │   ├── project-manager/
│   │   │   ├── ProjectManagerAgent.ts
│   │   │   └── types.ts
│   │   └── developer/
│   │       ├── DeveloperAgent.ts
│   │       └── types.ts
│   ├── claude/           # Claude integration
│   │   ├── client.ts
│   │   ├── prompts.ts
│   │   └── types.ts
│   ├── context/          # Context management
│   │   ├── store.ts
│   │   ├── analysis.ts
│   │   └── sharing.ts
│   ├── memory/           # Memory system
│   │   ├── store.ts
│   │   ├── types.ts
│   │   └── optimization.ts
│   ├── tools/           # Tool implementations
│   │   ├── base.ts
│   │   ├── filesystem.ts
│   │   ├── git.ts
│   │   └── http.ts
│   └── utils/           # Shared utilities
│       ├── logger.ts
│       ├── config.ts
│       └── validation.ts
├── tests/              # Test suite
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── examples/           # Usage examples
    ├── todo-app/
    └── code-review/
```

## Dependencies

```json
{
  "name": "autonomous-agents",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.17.1",
    "ioredis": "^5.3.2",
    "pg": "^8.11.3",
    "typescript": "^5.4.2",
    "zod": "^3.22.4",
    "winston": "^3.11.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^20.11.24",
    "@types/pg": "^8.11.2",
    "@typescript-eslint/eslint-plugin": "^7.1.1",
    "@typescript-eslint/parser": "^7.1.1",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "prettier": "^3.2.5",
    "ts-jest": "^29.1.2",
    "tsx": "^4.7.1",
    "typescript": "^5.4.2"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "jest",
    "lint": "eslint src tests",
    "format": "prettier --write ."
  }
}
```

## Configuration

### TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Environment Variables (.env.example)

```bash
# Claude API
CLAUDE_API_KEY=your_api_key
CLAUDE_MODEL=claude-3-opus-20240229

# Storage
POSTGRES_URL=postgresql://user:pass@localhost:5432/agents
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Memory System
MEMORY_BACKEND=postgres
VECTOR_DIMENSIONS=1536
MAX_MEMORIES=10000

# Context Management
MAX_CONTEXT_TOKENS=100000
SUMMARIZE_THRESHOLD=0.8
PRUNE_THRESHOLD=0.3
```

## Development Workflow

1. **Initial Setup**
   ```bash
   # Clone repository
   git clone https://github.com/your-org/autonomous-agents.git
   cd autonomous-agents

   # Install dependencies
   npm install

   # Copy and configure environment
   cp .env.example .env
   # Edit .env with your settings

   # Initialize database (if using Postgres)
   npm run db:init
   ```

2. **Development**
   ```bash
   # Start development server
   npm run dev

   # Run tests
   npm test

   # Run linting
   npm run lint

   # Format code
   npm run format
   ```

3. **Adding New Features**
   - Create feature branch: `git checkout -b feature/name`
   - Implement changes following project structure
   - Add tests for new functionality
   - Update documentation as needed
   - Submit pull request

## Testing Guidelines

1. **Unit Tests**
   ```typescript
   // src/agents/base/__tests__/Agent.test.ts
   import { Agent } from '../Agent';

   describe('Agent', () => {
     let agent: Agent;

     beforeEach(() => {
       agent = new Agent({
         role: 'test',
         tools: [],
         claude: mockClaudeClient
       });
     });

     test('executes actions based on context', async () => {
       const context = mockContext({
         current: [
           {
             type: 'thought',
             content: 'need to implement feature'
           }
         ]
       });

       const result = await agent.execute(context);
       expect(result.success).toBe(true);
     });
   });
   ```

2. **Integration Tests**
   ```typescript
   // tests/integration/project-workflow.test.ts
   describe('Project Workflow', () => {
     test('completes project tasks successfully', async () => {
       const pm = new ProjectManagerAgent();
       const dev = new DeveloperAgent();

       const requirements = 'Create a todo API';
       const plan = await pm.createPlan(requirements);
       
       for (const task of plan.tasks) {
         const implementation = await dev.implementTask(task);
         expect(implementation.success).toBe(true);
       }
     });
   });
   ```

## Deployment

1. **Production Build**
   ```bash
   # Build project
   npm run build

   # Start production server
   node dist/index.js
   ```

2. **Docker Deployment**
   ```dockerfile
   FROM node:20-alpine

   WORKDIR /app

   COPY package*.json ./
   RUN npm ci --production

   COPY dist/ ./dist/

   CMD ["node", "dist/index.js"]
   ```

   ```bash
   # Build and run container
   docker build -t autonomous-agents .
   docker run -p 3000:3000 autonomous-agents
   ```

3. **Environment Configuration**
   - Use environment variables for all configuration
   - Keep sensitive data in secure key management
   - Use different configs for dev/staging/prod

## Monitoring & Logging

1. **Logging Setup**
   ```typescript
   // src/utils/logger.ts
   import winston from 'winston';

   export const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || 'info',
     format: winston.format.json(),
     transports: [
       new winston.transports.Console(),
       new winston.transports.File({
         filename: 'error.log',
         level: 'error'
       })
     ]
   });
   ```

2. **Usage**
   ```typescript
   import { logger } from '@/utils/logger';

   logger.info('Agent started', {
     agent: 'developer',
     task: 'implement-auth'
   });

   logger.error('Task failed', {
     error: err.message,
     stack: err.stack
   });
   ```

## Next Steps

1. Clone repository and set up development environment
2. Review architecture documents:
   - AUTONOMOUS-AGENTS.md
   - CLAUDE-INTEGRATION.md
   - CONTEXT-MANAGEMENT.md
   - MEMORY-SYSTEM.md
3. Implement core components following the defined structure
4. Add comprehensive tests
5. Set up CI/CD pipeline
6. Deploy initial version

Would you like me to create any additional documentation or start implementing specific components?
