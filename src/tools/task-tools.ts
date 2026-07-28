import { z } from 'zod';
import type { Tool, ToolContext } from './tool-types';

function loadTasksModule() {
  try {
    return require('../../../../an5Tasks/dist/index');
  } catch {
    return null;
  }
}

export const createTask: Tool = {
  name: 'createTask',
  description: 'Create a new task from a code review issue. Extract the issue type, description, and assign priority.',
  inputSchema: z.object({
    type: z.enum(['BUG', 'WARNING', 'TODO', 'ISSUE', 'OPTIMIZATION', 'CONCERN']),
    description: z.string(),
    file: z.string().optional(),
    workspaceDir: z.string().optional().describe('Workspace root directory (defaults to cwd)'),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['todo', 'in-progress', 'done']),
    file: z.string().optional(),
    createdAt: z.string(),
  }),
  execute: async (input, context?) => {
    const mod = loadTasksModule();
    if (!mod) throw new Error('an5Tasks module not available. Build it first: cd an5Tasks && npm run build');

    const workspaceDir = input.workspaceDir || context?.schemaPath || process.cwd();
    const tasks = await mod.createTasksFromReview(
      `- ${input.type}: ${input.description}${input.file ? ` (file: ${input.file})` : ''}`,
      workspaceDir,
      false
    );
    return tasks[0] || null;
  },
};

export const listTasks: Tool = {
  name: 'listTasks',
  description: 'List all tasks from the tasks.json file in the workspace.',
  inputSchema: z.object({
    workspaceDir: z.string().optional().describe('Workspace root directory'),
    status: z.enum(['todo', 'in-progress', 'done']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['todo', 'in-progress', 'done']),
    file: z.string().optional(),
    createdAt: z.string(),
  })),
  execute: async (input, context?) => {
    const mod = loadTasksModule();
    if (!mod) throw new Error('an5Tasks module not available');

    const workspaceDir = input.workspaceDir || context?.schemaPath || process.cwd();
    return mod.getTasks(workspaceDir, { status: input.status, priority: input.priority });
  },
};

export const updateTaskTool: Tool = {
  name: 'updateTask',
  description: 'Update a task status or priority in tasks.json.',
  inputSchema: z.object({
    workspaceDir: z.string().optional().describe('Workspace root directory'),
    taskId: z.string(),
    status: z.enum(['todo', 'in-progress', 'done']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['todo', 'in-progress', 'done']),
    file: z.string().optional(),
    createdAt: z.string(),
  }).nullable(),
  execute: async (input, context?) => {
    const mod = loadTasksModule();
    if (!mod) throw new Error('an5Tasks module not available');

    const workspaceDir = input.workspaceDir || context?.schemaPath || process.cwd();
    return mod.updateTask(workspaceDir, input.taskId, { status: input.status, priority: input.priority });
  },
};

export const deleteTask: Tool = {
  name: 'deleteTask',
  description: 'Delete a task from tasks.json by ID.',
  inputSchema: z.object({
    workspaceDir: z.string().optional().describe('Workspace root directory'),
    taskId: z.string(),
  }),
  outputSchema: z.boolean(),
  execute: async (input, context?) => {
    const mod = loadTasksModule();
    if (!mod) throw new Error('an5Tasks module not available');

    const workspaceDir = input.workspaceDir || context?.schemaPath || process.cwd();
    return mod.deleteTask(workspaceDir, input.taskId);
  },
};
