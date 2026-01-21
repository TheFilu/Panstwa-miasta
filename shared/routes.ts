import { z } from 'zod';
import { insertRoomSchema, insertPlayerSchema, rooms, players, rounds, answers } from './schema';

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
  conflict: z.object({
    message: z.string(),
  }),
};

export const api = {
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms',
      input: z.object({
        playerName: z.string().min(1),
        totalRounds: z.number().min(1).max(20).optional(),
        categories: z.array(z.string()).optional(),
      }),
      responses: {
        201: z.object({
          code: z.string(),
          playerId: z.number(),
          token: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/rooms/join',
      input: z.object({
        code: z.string(),
        playerName: z.string().min(1),
      }),
      responses: {
        200: z.object({
          code: z.string(),
          playerId: z.number(),
          token: z.string(),
        }),
        404: errorSchemas.notFound,
        409: errorSchemas.conflict,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/rooms/:code',
      responses: {
        200: z.object({
          room: z.custom<typeof rooms.$inferSelect>(),
          players: z.array(z.custom<typeof players.$inferSelect>()),
          currentRound: z.custom<typeof rounds.$inferSelect>().optional(),
          myAnswers: z.array(z.custom<typeof answers.$inferSelect>()).optional(),
          allAnswers: z.array(z.custom<typeof answers.$inferSelect>()).optional(), // For results phase
        }),
        404: errorSchemas.notFound,
      },
    },
    start: {
      method: 'POST' as const,
      path: '/api/rooms/:code/start',
      responses: {
        200: z.object({ success: z.boolean() }),
        403: errorSchemas.validation,
        400: errorSchemas.validation,
      },
    },
    submit: {
      method: 'POST' as const,
      path: '/api/rooms/:code/submit',
      input: z.object({
        answers: z.record(z.string()),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
    finishRound: {
      method: 'POST' as const,
      path: '/api/rooms/:code/round/finish',
      responses: {
        200: z.object({ success: z.boolean() }),
        403: errorSchemas.validation,
      },
    },
    nextRound: {
      method: 'POST' as const,
      path: '/api/rooms/:code/round/next',
      responses: {
        200: z.object({ success: z.boolean() }),
        403: errorSchemas.validation,
      },
    },
  },
};

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
