import { z } from 'zod';
import type { Tool, ToolContext } from './tool-types';

function loadTasksModule() {
  try {
    return require('../../../../an5Tasks/dist/index');
  } catch {
    return null;
  }
}

const taskInputSchema = z.object({
  action: z.enum(['create', 'list', 'update', 'delete']).describe('Action to perform'),
  type: z.enum(['BUG', 'WARNING', 'TODO', 'ISSUE', 'OPTIMIZATION', 'CONCERN']).optional().describe('Task type (for create)'),
  description: z.string().optional().describe('Task description (for create)'),
  file: z.string().optional().describe('Related file (for create)'),
  taskId: z.string().optional().describe('Task ID (for update/delete)'),
  status: z.enum(['todo', 'in-progress', 'done']).optional().describe('Filter or set status'),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter or set priority'),
  workspaceDir: z.string().optional().describe('Workspace root directory'),
});

const taskOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    task: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      status: z.enum(['todo', 'in-progress', 'done']),
      file: z.string().optional(),
      createdAt: z.string(),
    }).nullable(),
  }),
  z.object({
    action: z.literal('list'),
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      status: z.enum(['todo', 'in-progress', 'done']),
      file: z.string().optional(),
      createdAt: z.string(),
    })),
    total: z.number(),
  }),
  z.object({
    action: z.literal('update'),
    task: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      status: z.enum(['todo', 'in-progress', 'done']),
      file: z.string().optional(),
      createdAt: z.string(),
    }).nullable(),
  }),
  z.object({
    action: z.literal('delete'),
    success: z.boolean(),
  }),
]);

export const taskTool: Tool = {
  name: 'task',
  description:
    'Manage tasks. Actions: create (new task), list (all tasks), update (status/priority), delete (by ID).',
  inputSchema: taskInputSchema,
  outputSchema: taskOutputSchema,
  async execute(input: z.infer<typeof taskInputSchema>, context?: ToolContext) {
    const mod = loadTasksModule();
    if (!mod) throw new Error('an5Tasks module not available. Build it first: cd an5Tasks && npm run build');

    const workspaceDir = input.workspaceDir || context?.schemaPath || process.cwd();

    switch (input.action) {
      case 'create': {
        const type = input.type || 'ISSUE';
        const desc = input.description || '';
        const tasks = await mod.createTasksFromReview(
          `- ${type}: ${desc}${input.file ? ` (file: ${input.file})` : ''}`,
          workspaceDir,
          false
        );
        return { action: 'create' as const, task: tasks[0] || null };
      }
      case 'list': {
        const tasks = await mod.getTasks(workspaceDir, { status: input.status, priority: input.priority });
        return { action: 'list' as const, tasks, total: tasks.length };
      }
      case 'update': {
        if (!input.taskId) throw new Error('taskId is required for update');
        const task = await mod.updateTask(workspaceDir, input.taskId, { status: input.status, priority: input.priority });
        return { action: 'update' as const, task };
      }
      case 'delete': {
        if (!input.taskId) throw new Error('taskId is required for delete');
        const success = await mod.deleteTask(workspaceDir, input.taskId);
        return { action: 'delete' as const, success };
      }
    }
  },
};
