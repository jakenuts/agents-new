import { promises as fs } from 'fs';
import path from 'path';

export interface FileToolResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface WebToolResponse {
  success: boolean;
  content?: string;
  status?: number;
  error?: string;
}

export const fileTools = {
  readFile: async (filePath: string): Promise<FileToolResponse> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  writeFile: async (filePath: string, content: string): Promise<FileToolResponse> => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  listFiles: async (dirPath: string): Promise<FileToolResponse> => {
    try {
      const files = await fs.readdir(dirPath);
      return { success: true, content: JSON.stringify(files) };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
};

export const webTools = {
  fetchUrl: async (url: string): Promise<WebToolResponse> => {
    try {
      const response = await fetch(url);
      const content = await response.text();
      return {
        success: true,
        content,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
};

export interface Tools {
  file: typeof fileTools;
  web: typeof webTools;
}

export const tools: Tools = {
  file: fileTools,
  web: webTools
};
