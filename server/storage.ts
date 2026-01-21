import { db } from "./db";
import {
  rooms,
  players,
  rounds,
  answers,
  type Room,
  type Player,
  type Round,
  type Answer,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type InsertRoom,
  type InsertPlayer,
  type InsertAnswer,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // Rooms
  createRoom(
    name: string,
    totalRounds?: number,
    categories?: string[],
    timerDuration?: number | null,
  ): Promise<Room>;
  getRoom(code: string): Promise<Room | undefined>;
  getRoomById(id: number): Promise<Room | undefined>;
  updateRoomStatus(id: number, status: string): Promise<Room>;
  updateRoomRound(id: number, roundNumber: number): Promise<Room>;
  updateRoomCategories(id: number, categories: string[]): Promise<Room>;
  updateRoomSettings(
    id: number,
    settings: { totalRounds?: number; timerDuration?: number | null },
  ): Promise<Room>;
  addUsedLetter(id: number, letter: string): Promise<Room>;

  // Players
  addPlayer(roomId: number, name: string, isHost?: boolean): Promise<Player>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayers(roomId: number): Promise<Player[]>;
  updatePlayerScore(id: number, points: number): Promise<Player>;

  // Rounds
  createRound(roomId: number, letter: string): Promise<Round>;
  getRound(roomId: number, roundNumber: number): Promise<Round | undefined>;
  getCurrentRound(roomId: number): Promise<Round | undefined>;
  markFirstSubmission(id: number): Promise<Round>;
  completeRound(id: number): Promise<Round>;

  // Answers
  submitAnswers(
    roundId: number,
    playerId: number,
    submissions: Record<string, string>,
  ): Promise<void>;
  getAnswers(roundId: number): Promise<Answer[]>;
  updateAnswerValidation(
    id: number,
    isValid: boolean,
    points: number,
    reason?: string,
  ): Promise<Answer>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(
    playerName: string,
    totalRounds: number = 5,
    categories?: string[],
    timerDuration: number | null = 10,
  ): Promise<Room> {
    const code = randomBytes(2).toString("hex").toUpperCase(); // 4 chars
    const [room] = await db
      .insert(rooms)
      .values({
        code,
        totalRounds,
        timerDuration,
        status: "waiting",
        categories: categories || [
          "panstwo",
          "miasto",
          "imie",
          "zwierze",
          "rzecz",
          "roslina",
        ],
        usedLetters: [],
      })
      .returning();
    return room;
  }

  async getRoom(code: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    return room;
  }

  async getRoomById(id: number): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async updateRoomStatus(id: number, status: string): Promise<Room> {
    const [room] = await db
      .update(rooms)
      .set({ status })
      .where(eq(rooms.id, id))
      .returning();
    return room;
  }

  async updateRoomRound(id: number, roundNumber: number): Promise<Room> {
    const [room] = await db
      .update(rooms)
      .set({ roundNumber })
      .where(eq(rooms.id, id))
      .returning();
    return room;
  }

  async updateRoomCategories(id: number, categories: string[]): Promise<Room> {
    const [room] = await db
      .update(rooms)
      .set({ categories })
      .where(eq(rooms.id, id))
      .returning();
    return room;
  }

  async updateRoomSettings(
    id: number,
    settings: { totalRounds?: number; timerDuration?: number | null },
  ): Promise<Room> {
    const [room] = await db
      .update(rooms)
      .set(settings)
      .where(eq(rooms.id, id))
      .returning();
    return room;
  }

  async addUsedLetter(id: number, letter: string): Promise<Room> {
    const room = await this.getRoomById(id);
    if (!room) throw new Error("Room not found");
    const usedLetters = [...(room.usedLetters || []), letter];
    const [updated] = await db
      .update(rooms)
      .set({ usedLetters })
      .where(eq(rooms.id, id))
      .returning();
    return updated;
  }

  async addPlayer(
    roomId: number,
    name: string,
    isHost: boolean = false,
  ): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values({
        roomId,
        name,
        isHost,
        score: 0,
        isReady: false,
      })
      .returning();
    return player;
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }

  async getPlayers(roomId: number): Promise<Player[]> {
    return db.select().from(players).where(eq(players.roomId, roomId));
  }

  async updatePlayerScore(id: number, points: number): Promise<Player> {
    const player = await this.getPlayer(id);
    if (!player) throw new Error("Player not found");
    const [updated] = await db
      .update(players)
      .set({ score: player.score + points })
      .where(eq(players.id, id))
      .returning();
    return updated;
  }

  async createRound(roomId: number, letter: string): Promise<Round> {
    const [round] = await db
      .insert(rounds)
      .values({
        roomId,
        letter,
        status: "active",
      })
      .returning();
    return round;
  }

  async getCurrentRound(roomId: number): Promise<Round | undefined> {
    // Get latest active or validating round
    const [round] = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.roomId, roomId), eq(rounds.status, "active")))
      .orderBy(desc(rounds.startedAt))
      .limit(1);

    if (round) return round;

    // If no active, check for validating/completed to show results?
    // Usually we want the *latest* round regardless of status for display
    const [latest] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.roomId, roomId))
      .orderBy(desc(rounds.startedAt))
      .limit(1);
    return latest;
  }

  async getRound(
    roomId: number,
    roundNumber: number,
  ): Promise<Round | undefined> {
    // This is tricky without round number in table, but we assume chronological order
    // For now, getCurrentRound is mostly what we need
    return this.getCurrentRound(roomId);
  }

  async completeRound(id: number): Promise<Round> {
    const [round] = await db
      .update(rounds)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(rounds.id, id))
      .returning();
    return round;
  }

  async markFirstSubmission(id: number): Promise<Round> {
    const [round] = await db
      .update(rounds)
      .set({ firstSubmissionAt: new Date() })
      .where(eq(rounds.id, id))
      .returning();
    return round;
  }

  async submitAnswers(
    roundId: number,
    playerId: number,
    submissions: Record<string, string>,
  ): Promise<void> {
    // Upsert answers? Or delete old ones?
    // Let's delete old ones for this round/player first to be safe (simple overwrite)
    await db
      .delete(answers)
      .where(and(eq(answers.roundId, roundId), eq(answers.playerId, playerId)));

    for (const [category, word] of Object.entries(submissions)) {
      if (word.trim()) {
        await db.insert(answers).values({
          roundId,
          playerId,
          category,
          word: word.trim(),
          isValid: null, // Pending validation
          points: 0,
        });
      }
    }
  }

  async getAnswers(roundId: number): Promise<Answer[]> {
    return db.select().from(answers).where(eq(answers.roundId, roundId));
  }

  async updateAnswerValidation(
    id: number,
    isValid: boolean,
    points: number,
    reason?: string,
  ): Promise<Answer> {
    const [answer] = await db
      .update(answers)
      .set({ isValid, points, validationReason: reason })
      .where(eq(answers.id, id))
      .returning();
    return answer;
  }
}

export const storage = new DatabaseStorage();
