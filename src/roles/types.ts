export interface RoleCapability {
  name: string;
  description: string;
}

export interface RoleDefinition {
  name: string;
  description: string;
  responsibilities: string[];
  capabilities: Record<string, string>;
  tools: Record<string, string>;
  instructions: string[];
}

export interface RoleContext {
  state: Record<string, unknown>;
  collaborators: Map<string, string>;
}

export interface LoadedRole {
  definition: RoleDefinition;
  context: RoleContext;
}

export interface RoleValidationError {
  field: string;
  message: string;
}

export function validateRole(role: unknown): RoleValidationError[] {
  const errors: RoleValidationError[] = [];

  if (!role || typeof role !== 'object') {
    errors.push({
      field: 'root',
      message: 'Role must be an object'
    });
    return errors;
  }

  const r = role as Partial<RoleDefinition>;

  // Required string fields
  ['name', 'description'].forEach(field => {
    if (!r[field as keyof RoleDefinition] || typeof r[field as keyof RoleDefinition] !== 'string') {
      errors.push({
        field,
        message: `${field} is required and must be a string`
      });
    }
  });

  // Required array fields
  ['responsibilities', 'instructions'].forEach(field => {
    const value = r[field as keyof RoleDefinition];
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
      errors.push({
        field,
        message: `${field} must be an array of strings`
      });
    }
  });

  // Required object fields
  ['capabilities', 'tools'].forEach(field => {
    const value = r[field as keyof RoleDefinition];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push({
        field,
        message: `${field} must be an object`
      });
      return;
    }

    // Check that all values are strings
    Object.entries(value).forEach(([key, val]) => {
      if (typeof val !== 'string') {
        errors.push({
          field: `${field}.${key}`,
          message: 'Value must be a string'
        });
      }
    });
  });

  return errors;
}

export function createEmptyRole(): LoadedRole {
  return {
    definition: {
      name: '',
      description: '',
      responsibilities: [],
      capabilities: {},
      tools: {},
      instructions: []
    },
    context: {
      state: {},
      collaborators: new Map()
    }
  };
}

export function mergeRoles(base: RoleDefinition, extension: Partial<RoleDefinition>): RoleDefinition {
  return {
    name: extension.name || base.name,
    description: extension.description || base.description,
    responsibilities: [
      ...base.responsibilities,
      ...(extension.responsibilities || [])
    ],
    capabilities: {
      ...base.capabilities,
      ...extension.capabilities
    },
    tools: {
      ...base.tools,
      ...extension.tools
    },
    instructions: [
      ...base.instructions,
      ...(extension.instructions || [])
    ]
  };
}
