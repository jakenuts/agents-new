# Ax Framework Demo: Project Manager & Coder Agents

This demo showcases the use of the Ax framework to create a collaborative agent system where a project manager agent coordinates with a coder agent to build a simple TypeScript application.

## Project Structure

```
demo/
├── src/
│   ├── tools.ts           # File and web tools implementation
│   ├── project-manager.ts # Project manager agent implementation
│   ├── coder.ts          # Coder agent implementation
│   └── index.ts          # Main orchestration script
├── test-output/          # Generated project output directory
└── package.json          # Project dependencies
```

## Features

- **Project Manager Agent**: Breaks down requirements into tasks and manages their execution
- **Coder Agent**: Implements features and writes code based on tasks
- **File & Web Tools**: Provides capabilities for file operations and web requests
- **Task Dependencies**: Ensures tasks are executed in the correct order
- **Generated Output**: Creates a simple Todo API application

## Running the Demo

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your-api-key
   ```

3. Run the demo:
   ```bash
   npm run dev
   ```

## Generated Application

The demo will generate a simple Todo API application in the `test-output` directory with:

- Express.js server setup
- Todo service implementation
- Basic CRUD operations
- TypeScript types and interfaces

## Implementation Details

### Project Manager Agent

The project manager agent:
- Creates a project plan from requirements
- Breaks down work into dependent tasks
- Tracks task status
- Coordinates with the coder agent

### Coder Agent

The coder agent:
- Implements assigned tasks
- Generates appropriate code
- Creates necessary project files
- Can perform code reviews
- Writes tests

### Tools

The demo includes tools for:
- File operations (read/write/list)
- Web requests
- Directory management

## Example Output

The generated Todo API will include:
- Project structure
- Express.js server
- Todo service implementation
- TypeScript types
- Basic tests
