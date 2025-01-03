 import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import {
  LoadedRole,
  RoleDefinition,
  validateRole,
  createEmptyRole,
  mergeRoles
} from './types.js';

export class RoleLoader {
  private roleCache: Map<string, LoadedRole> = new Map();
  private baseRoles: Map<string, RoleDefinition> = new Map();

  constructor() {
    // Initialize with empty base roles
    this.baseRoles.set('default', {
      name: 'Base Role',
      description: 'Default base role with common capabilities',
      responsibilities: [
        'Execute assigned tasks',
        'Maintain task context',
        'Collaborate with other agents'
      ],
      capabilities: {
        'task_execution': 'Can execute assigned tasks',
        'context_management': 'Can maintain and update task context',
        'communication': 'Can communicate with other agents'
      },
      tools: {},
      instructions: [
        'Follow assigned tasks carefully',
        'Maintain accurate context',
        'Communicate clearly with other agents'
      ]
    });
  }

  async loadRole(path: string): Promise<LoadedRole> {
    // Check cache first
    const cached = this.roleCache.get(path);
    if (cached) {
      return cached;
    }

    try {
      // Read and parse role file
      const content = await fs.readFile(path, 'utf-8');
      const roleDefinition = JSON.parse(content);

      // Validate role definition
      const errors = validateRole(roleDefinition);
      if (errors.length > 0) {
        throw new Error(
          `Invalid role definition in ${path}:\n${errors
            .map(e => `${e.field}: ${e.message}`)
            .join('\n')}`
        );
      }

      // Merge with base role
      const baseRole = this.baseRoles.get('default')!;
      const mergedDefinition = mergeRoles(baseRole, roleDefinition);

      // Create loaded role
      const loadedRole: LoadedRole = {
        definition: mergedDefinition,
        context: {
          state: {},
          collaborators: new Map()
        }
      };

      // Cache the role
      this.roleCache.set(path, loadedRole);

      return loadedRole;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load role from ${path}: ${error.message}`);
      }
      throw error;
    }
  }

  async saveRole(path: string, role: RoleDefinition): Promise<void> {
    try {
      // Validate role
      const errors = validateRole(role);
      if (errors.length > 0) {
        throw new Error(
          `Invalid role definition:\n${errors
            .map(e => `${e.field}: ${e.message}`)
            .join('\n')}`
        );
      }

      // Ensure directory exists
      await fs.mkdir(dirname(path), { recursive: true });

      // Write role file
      await fs.writeFile(
        path,
        JSON.stringify(role, null, 2),
        'utf-8'
      );

      // Clear cache entry
      this.roleCache.delete(path);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save role to ${path}: ${error.message}`);
      }
      throw error;
    }
  }

  async createRole(
    path: string,
    definition: Partial<RoleDefinition>
  ): Promise<LoadedRole> {
    // Start with empty role
    const baseRole = createEmptyRole();

    // Merge with provided definition
    const mergedDefinition = mergeRoles(
      baseRole.definition,
      definition
    );

    // Save role
    await this.saveRole(path, mergedDefinition);

    // Load and return the role
    return this.loadRole(path);
  }

  clearCache(): void {
    this.roleCache.clear();
  }

  addBaseRole(name: string, definition: RoleDefinition): void {
    const errors = validateRole(definition);
    if (errors.length > 0) {
      throw new Error(
        `Invalid base role definition:\n${errors
          .map(e => `${e.field}: ${e.message}`)
          .join('\n')}`
      );
    }
    this.baseRoles.set(name, definition);
  }

  getBaseRole(name: string): RoleDefinition | undefined {
    return this.baseRoles.get(name);
  }
}
