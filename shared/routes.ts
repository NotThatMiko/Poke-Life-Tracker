import { z } from 'zod';
import { insertHabitSchema, insertHabitLogSchema, habits, habitLogs } from './schema';

// Shared Error Schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// API Contract
export const api = {
  habits: {
    list: {
      method: 'GET' as const,
      path: '/api/habits' as const,
      responses: {
        200: z.array(z.custom<typeof habits.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/habits' as const,
      input: insertHabitSchema,
      responses: {
        201: z.custom<typeof habits.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/habits/:id' as const,
      input: insertHabitSchema.partial(),
      responses: {
        200: z.custom<typeof habits.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/habits/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  habitLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/habits/:habitId/logs' as const,
      responses: {
        200: z.array(z.custom<typeof habitLogs.$inferSelect>()),
      },
    },
    toggle: {
      method: 'POST' as const,
      path: '/api/habits/:habitId/logs' as const,
      input: z.object({ date: z.string(), completed: z.boolean() }),
      responses: {
        200: z.custom<typeof habitLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
};

// URL Builder Helper
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// Type Helpers
export type HabitInput = z.infer<typeof api.habits.create.input>;
export type HabitResponse = z.infer<typeof api.habits.create.responses[201]>;
export type HabitUpdateInput = z.infer<typeof api.habits.update.input>;
export type HabitListResponse = z.infer<typeof api.habits.list.responses[200]>;
export type HabitLogInput = z.infer<typeof api.habitLogs.toggle.input>;
export type HabitLogResponse = z.infer<typeof api.habitLogs.toggle.responses[200]>;
export type HabitLogListResponse = z.infer<typeof api.habitLogs.list.responses[200]>;
