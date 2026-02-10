import { db } from "./db";
import {
  rooms,
  players,
  rounds,
  answers,
  answerVotes,
  type Room,
  type Player,
  type Round,
  type Answer,
  type AnswerVote,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type InsertRoom,
  type InsertPlayer,
  type InsertAnswer,
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
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
  getAnswerById(id: number): Promise<Answer | undefined>;
  getAnswerVotesForRound(roundId: number): Promise<AnswerVote[]>;
  getAnswerVotesByAnswerId(answerId: number): Promise<AnswerVote[]>;
  upsertAnswerVote(
    answerId: number,
    playerId: number,
    accepted: boolean,
  ): Promise<AnswerVote>;
  setCommunityRejected(id: number, rejected: boolean): Promise<Answer>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(
    playerName: string,
    totalRounds: number = 5,
    categories?: string[],
    timerDuration: number | null = 10,
  ): Promise<Room> {
    const code = randomBytes(2).toString("hex").toUpperCase(); // 4 chars
    const result = await db
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
    
    if (!result || result.length === 0) {
      throw new Error("Failed to create room - database insert returned no results");
    }
    
    return result[0];
  }

  async getRoom(code: string): Promise<Room | undefined> {
    const result = await db.select().from(rooms).where(eq(rooms.code, code));
    return result.length > 0 ? result[0] : undefined;
  }

  async getRoomById(id: number): Promise<Room | undefined> {
    const result = await db.select().from(rooms).where(eq(rooms.id, id));
    return result.length > 0 ? result[0] : undefined;
  }

  async updateRoomStatus(id: number, status: string): Promise<Room> {
    const result = await db
      .update(rooms)
      .set({ status })
      .where(eq(rooms.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update room status - room not found");
    }
    return result[0];
  }

  async updateRoomRound(id: number, roundNumber: number): Promise<Room> {
    const result = await db
      .update(rooms)
      .set({ roundNumber, status: "playing" })
      .where(eq(rooms.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update room round - room not found");
    }
    return result[0];
  }

  async updateRoomCategories(id: number, categories: string[]): Promise<Room> {
    const result = await db
      .update(rooms)
      .set({ categories })
      .where(eq(rooms.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update room categories - room not found");
    }
    return result[0];
  }

  async updateRoomSettings(
    id: number,
    settings: { totalRounds?: number; timerDuration?: number | null },
  ): Promise<Room> {
    const result = await db
      .update(rooms)
      .set(settings)
      .where(eq(rooms.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update room settings - room not found");
    }
    return result[0];
  }

  async addUsedLetter(id: number, letter: string): Promise<Room> {
    const room = await this.getRoomById(id);
    if (!room) throw new Error("Room not found");
    const usedLetters = [...(room.usedLetters || []), letter];
    const result = await db
      .update(rooms)
      .set({ usedLetters })
      .where(eq(rooms.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to add used letter - room not found");
    }
    return result[0];
  }

  async addPlayer(
    roomId: number,
    name: string,
    isHost: boolean = false,
  ): Promise<Player> {
    const result = await db
      .insert(players)
      .values({
        roomId,
        name,
        isHost,
        score: 0,
        isReady: false,
      })
      .returning();
    
    if (!result || result.length === 0) {
      throw new Error("Failed to add player - database insert returned no results");
    }
    
    return result[0];
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.id, id));
    return result.length > 0 ? result[0] : undefined;
  }

  async getPlayers(roomId: number): Promise<Player[]> {
    return db.select().from(players).where(eq(players.roomId, roomId));
  }

  async updatePlayerScore(id: number, points: number): Promise<Player> {
    const player = await this.getPlayer(id);
    if (!player) throw new Error("Player not found");
    const result = await db
      .update(players)
      .set({ score: player.score + points })
      .where(eq(players.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update player score - player not found");
    }
    return result[0];
  }

  async createRound(roomId: number, letter: string): Promise<Round> {
    const result = await db
      .insert(rounds)
      .values({
        roomId,
        letter,
        status: "active",
        startedAt: new Date(),
      })
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to create round - database insert returned no results");
    }
    return result[0];
  }

  async getCurrentRound(roomId: number): Promise<Round | undefined> {
    // Get latest active or validating round
    const result = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.roomId, roomId), eq(rounds.status, "active")))
      .orderBy(desc(rounds.startedAt))
      .limit(1);

    if (result.length > 0) return result[0];

    // If no active, check for validating/completed to show results?
    // Usually we want the *latest* round regardless of status for display
    const latestResult = await db
      .select()
      .from(rounds)
      .where(eq(rounds.roomId, roomId))
      .orderBy(desc(rounds.startedAt))
      .limit(1);
    return latestResult.length > 0 ? latestResult[0] : undefined;
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
    const result = await db
      .update(rounds)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(rounds.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to complete round - round not found");
    }
    return result[0];
  }

  async markFirstSubmission(id: number): Promise<Round> {
    const result = await db
      .update(rounds)
      .set({ firstSubmissionAt: new Date() })
      .where(eq(rounds.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to mark first submission - round not found");
    }
    return result[0];
  }

  async submitAnswers(
    roundId: number,
    playerId: number,
    submissions: Record<string, string>,
  ): Promise<void> {
    if (isNaN(roundId) || isNaN(playerId) || roundId <= 0 || playerId <= 0) {
      console.error(`[Storage] CRITICAL: Invalid IDs in submitAnswers - roundId: ${roundId}, playerId: ${playerId}`);
      throw new Error(`Invalid ID syntax: roundId=${roundId}, playerId=${playerId}`);
    }

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
    const allAnswers = await db.select().from(answers).where(eq(answers.roundId, roundId));
    // Drizzle might return multiple rows per player/category. 
    // We need to count unique players who have submitted AT LEAST ONE answer.
    return allAnswers;
  }

  async updateAnswerValidation(
    id: number,
    isValid: boolean,
    points: number,
    reason?: string,
  ): Promise<Answer> {
    const result = await db
      .update(answers)
      .set({ isValid, points, validationReason: reason })
      .where(eq(answers.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update answer validation - answer not found");
    }
    return result[0];
  }

  async getAnswerById(id: number): Promise<Answer | undefined> {
    const result = await db.select().from(answers).where(eq(answers.id, id));
    return result.length > 0 ? result[0] : undefined;
  }

  async getAnswerVotesForRound(roundId: number): Promise<AnswerVote[]> {
    const roundAnswers = await db
      .select({ id: answers.id })
      .from(answers)
      .where(eq(answers.roundId, roundId));

    const answerIds = roundAnswers.map((row) => row.id);
    if (answerIds.length === 0) return [];

    return db.select().from(answerVotes).where(inArray(answerVotes.answerId, answerIds));
  }

  async getAnswerVotesByAnswerId(answerId: number): Promise<AnswerVote[]> {
    return db.select().from(answerVotes).where(eq(answerVotes.answerId, answerId));
  }

  async upsertAnswerVote(
    answerId: number,
    playerId: number,
    accepted: boolean,
  ): Promise<AnswerVote> {
    const existing = await db
      .select()
      .from(answerVotes)
      .where(and(eq(answerVotes.answerId, answerId), eq(answerVotes.playerId, playerId)));

    if (existing.length > 0) {
      const result = await db
        .update(answerVotes)
        .set({ accepted, createdAt: new Date() })
        .where(eq(answerVotes.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(answerVotes)
      .values({ answerId, playerId, accepted })
      .returning();
    return result[0];
  }

  async setCommunityRejected(id: number, rejected: boolean): Promise<Answer> {
    const result = await db
      .update(answers)
      .set({ communityRejected: rejected })
      .where(eq(answers.id, id))
      .returning();
    if (!result || result.length === 0) {
      throw new Error("Failed to update community rejection - answer not found");
    }
    return result[0];
  }
}

export const storage = new DatabaseStorage();
