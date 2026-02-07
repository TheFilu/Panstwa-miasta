import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models
export * from "./models/chat";

// === TABLE DEFINITIONS ===

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("waiting"), // waiting, playing, finished
  roundNumber: integer("round_number").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(5),
  timerDuration: integer("timer_duration").default(10), // Seconds after first submission, null = disabled
  categories: jsonb("categories").$type<string[]>().default(['panstwo', 'miasto', 'imie', 'zwierze', 'rzecz', 'roslina']),
  usedLetters: jsonb("used_letters").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  name: text("name").notNull(),
  score: integer("score").notNull().default(0),
  isHost: boolean("is_host").notNull().default(false),
  isReady: boolean("is_ready").notNull().default(false),
  socketId: text("socket_id"), // For realtime mapping
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  letter: text("letter").notNull(),
  status: text("status").notNull().default("active"), // active, validating, completed
  firstSubmissionAt: timestamp("first_submission_at"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const answers = pgTable("answers", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull(),
  playerId: integer("player_id").notNull(),
  category: text("category").notNull(), // panstwo, miasto, imie, zwierze, rzecz, roslina
  word: text("word").notNull(),
  isValid: boolean("is_valid"), // null = pending, true/false
  points: integer("points").default(0),
  validationReason: text("validation_reason"),
});

// === RELATIONS ===

export const playersRelations = relations(players, ({ one }) => ({
  room: one(rooms, {
    fields: [players.roomId],
    references: [rooms.id],
  }),
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  room: one(rooms, {
    fields: [rounds.roomId],
    references: [rooms.id],
  }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  round: one(rounds, {
    fields: [answers.roundId],
    references: [rounds.id],
  }),
  player: one(players, {
    fields: [answers.playerId],
    references: [players.id],
  }),
}));

// === ZOD SCHEMAS ===

export const insertRoomSchema = createInsertSchema(rooms).omit({ 
  id: true, 
  createdAt: true, 
  usedLetters: true,
  status: true,
  roundNumber: true
});

export const insertPlayerSchema = createInsertSchema(players).omit({ 
  id: true, 
  score: true, 
  isReady: true,
  joinedAt: true,
  isHost: true // Host is determined by logic
});

export const insertAnswerSchema = createInsertSchema(answers).omit({
  id: true,
  isValid: true,
  points: true,
  validationReason: true
});

// === TYPES ===

export type Room = typeof rooms.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Answer = typeof answers.$inferSelect;

export type InsertRoom = typeof rooms.$inferInsert;
export type InsertPlayer = typeof players.$inferInsert;
export type InsertAnswer = typeof answers.$inferInsert;

export type GameState = {
  room: Room;
  players: Player[];
  currentRound?: Round;
  answers?: Answer[];
};

export const CATEGORIES = [
  { id: "panstwo", label: "Państwo" },
  { id: "miasto", label: "Miasto" },
  { id: "imie", label: "Imię" },
  { id: "zwierze", label: "Zwierzę" },
  { id: "rzecz", label: "Rzecz" },
  { id: "roslina", label: "Roślina" },
];

export type CreateRoomRequest = {
  playerName: string;
  totalRounds?: number;
  timerDuration?: number | null;
  categories?: string[];
};

export type JoinRoomRequest = {
  code: string;
  playerName: string;
};

export type SubmitAnswersRequest = {
  answers: Record<string, string>; // category -> word
};
