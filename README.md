# Autonomous Agent Framework

A TypeScript-based framework for building autonomous AI agents that can maintain context, manage memory, and execute complex tasks through a combination of planning and execution.

## Features

- 🤖 **Unified Agent System**
  - Role-based behavior through JSON configuration
  - Dynamic tool integration
  - Task execution pipeline
  - Claude API integration

- 🔄 **Communication Backplane**
  - Redis-based message broker
  - Context sharing
  - Agent discovery
  - Reliable cleanup

- 📝 **Context Management**
  - Thread-based organization
  - Automatic summarization
  - Metadata handling
  - Context pruning

- 🧠 **Memory System**
  - Long-term storage
  - Vector-based retrieval
  - Memory consolidation
  - Hierarchical organization

- 📊 **Logging System**
  - Centralized logging
  - Performance metrics
  - Token usage tracking
  - Structured logging with metadata

## Prerequisites

- Node.js 16+
- Redis server
- Claude API access
- TypeScript 4.x+

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/autonomous-agent-framework.git
cd autonomous-agent-framework
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment configuration:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
- Add your Claude API key
- Configure Redis connection
- Adjust other settings as needed

## Quick Start

1. Start the development server:
```bash
npm run dev
```

2. Run the demo agents:
```bash
cd demo
npm install
npm start
```

## Project Structure

```
├── src/
│   ├── agents/         # Agent system implementation
│   ├── backplane/      # Communication infrastructure
│   ├── claude/         # Claude API integration
│   ├── context/        # Context management system
│   ├── logging/        # Logging infrastructure
│   ├── memory/         # Memory system
│   ├── roles/          # Role definitions
│   └── tools/          # Tool implementations
├── demo/               # Example implementations
├── docs/              # Detailed documentation
└── tests/             # Test suites
```

## Documentation

- [Project Status](./PROJECT-STATUS.md)
- [Implementation Plan](./IMPLEMENTATION-PLAN.md)
- [Autonomous Agents](./AUTONOMOUS-AGENTS.md)
- [Context Management](./CONTEXT-MANAGEMENT.md)
- [Memory System](./MEMORY-SYSTEM.md)

## Development

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit:
```bash
git add .
git commit -m "feat: your feature description"
```

3. Run tests:
```bash
npm test
```

4. Push your changes:
```bash
git push origin feature/your-feature-name
```

## Configuration

The framework can be configured through environment variables. See [.env.example](./.env.example) for all available options.

Key configuration areas:
- Claude API settings
- Redis connection
- Logging preferences
- Memory system configuration
- Context management settings
- Agent behavior controls

## Testing

Run different test suites:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- src/__tests__/agent-integration.test.ts

# Run with coverage
npm test -- --coverage
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

Please ensure your PR:
- Includes tests
- Updates documentation
- Follows the coding style
- Includes a clear description

## Security

- Never commit API keys or secrets
- Use environment variables for sensitive data
- Follow security best practices
- Report vulnerabilities responsibly

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Claude API by Anthropic
- Redis for the communication backplane
- Contributors and maintainers

## Support

- Create an issue for bug reports
- Start a discussion for feature requests
- Check documentation for common questions
