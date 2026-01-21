import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas, CATEGORIES } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { db } from "./db";
import { players } from "@shared/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register integrations
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);

  // Game Routes

  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const { playerName, totalRounds, categories } = api.rooms.create.input.parse(req.body);
      const room = await storage.createRoom(playerName, totalRounds, categories);
      const player = await storage.addPlayer(room.id, playerName, true);
      res.status(201).json({ code: room.code, playerId: player.id, token: String(player.id) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.rooms.join.path, async (req, res) => {
    try {
      const { code, playerName } = api.rooms.join.input.parse(req.body);
      const room = await storage.getRoom(code);
      if (!room) return res.status(404).json({ message: "Room not found" });
      
      // Check if name taken
      const existingPlayers = await storage.getPlayers(room.id);
      if (existingPlayers.some(p => p.name === playerName)) {
        return res.status(409).json({ message: "Name already taken" });
      }

      if (room.status !== 'waiting') {
         // Allow rejoin if disconnected? For MVP, no rejoining logic yet, just new player
         // Or maybe allow joining as spectator?
         // For now, block if playing
         // return res.status(409).json({ message: "Game already started" });
      }

      const player = await storage.addPlayer(room.id, playerName, false);
      res.status(200).json({ code: room.code, playerId: player.id, token: String(player.id) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.rooms.get.path, async (req, res) => {
    const code = req.params.code;
    const room = await storage.getRoom(code);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const playersList = await storage.getPlayers(room.id);
    const currentRound = await storage.getCurrentRound(room.id);
    
    // Check playerId from header or query?
    // For MVP, we trust the client to filter view, but better to filter sensitive data here
    // We won't implement strict auth check here for MVP speed, but good practice
    
    // Get answers if round completed or for "myAnswers"
    let myAnswers = undefined;
    let allAnswers = undefined;

    if (currentRound) {
      // If round completed, send all answers
      if (currentRound.status === 'completed') {
        allAnswers = await storage.getAnswers(currentRound.id);
      }
    }

    res.json({
      room,
      players: playersList,
      currentRound,
      myAnswers, // Frontend needs to manage its own answers state mostly, but sync is good
      allAnswers
    });
  });

  app.post(api.rooms.start.path, async (req, res) => {
    const room = await storage.getRoom(req.params.code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    
    // TODO: Verify host (req.body.playerId or header)
    
    if (room.status !== 'waiting') return res.status(400).json({ message: "Game already started" });

    await storage.updateRoomStatus(room.id, 'playing');
    await startNewRound(room.id);
    
    res.json({ success: true });
  });

  app.post(api.rooms.submit.path, async (req, res) => {
    const room = await storage.getRoom(req.params.code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    const currentRound = await storage.getCurrentRound(room.id);
    if (!currentRound || currentRound.status !== 'active') return res.status(400).json({ message: "No active round" });

    const playerId = Number(req.headers.authorization);
    if (!playerId) return res.status(401).json({ message: "Unauthorized" });

    const { answers } = api.rooms.submit.input.parse(req.body);
    await storage.submitAnswers(currentRound.id, playerId, answers);

    // Auto-finish logic: check if all players have submitted
    const playersInRoom = await storage.getPlayers(room.id);
    const roundAnswers = await storage.getAnswers(currentRound.id);
    
    // Group answers by player to count how many players submitted
    const submittedPlayerIds = new Set(roundAnswers.map(a => a.playerId));
    
    if (submittedPlayerIds.size >= playersInRoom.length) {
      // All players submitted! Finish round automatically
      await validateRound(currentRound.id, currentRound.letter);
      await storage.completeRound(currentRound.id);
      
      if (room.roundNumber >= room.totalRounds) {
          await storage.updateRoomStatus(room.id, 'finished');
      }
    }
    
    res.json({ success: true });
  });

  app.post(api.rooms.finishRound.path, async (req, res) => {
    const room = await storage.getRoom(req.params.code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    const currentRound = await storage.getCurrentRound(room.id);
    if (!currentRound) return res.status(400).json({ message: "No active round" });

    if (currentRound.status === 'completed') return res.status(400).json({ message: "Round already finished" });

    // Validate answers using OpenAI
    await validateRound(currentRound.id, currentRound.letter);
    
    await storage.completeRound(currentRound.id);
    
    // Update scores
    // Logic inside validateRound handled scoring? Yes.
    
    // Check if game end?
    if (room.roundNumber >= room.totalRounds) {
        await storage.updateRoomStatus(room.id, 'finished');
    }

    res.json({ success: true });
  });

  app.post(api.rooms.nextRound.path, async (req, res) => {
    const room = await storage.getRoom(req.params.code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    
    if (room.status === 'finished') return res.status(400).json({ message: "Game finished" });

    await startNewRound(room.id);
    res.json({ success: true });
  });

  app.post(api.rooms.updateCategories.path, async (req, res) => {
    const room = await storage.getRoom(req.params.code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    
    if (room.status !== 'waiting') return res.status(400).json({ message: "Cannot update categories after game started" });

    const { categories } = api.rooms.updateCategories.input.parse(req.body);
    await storage.updateRoomCategories(room.id, categories);
    res.json({ success: true });
  });

  return httpServer;
}

async function startNewRound(roomId: number) {
  const room = await storage.getRoomById(roomId);
  if (!room) return;

  // Pick random letter
  const alphabet = "ABCDEFGHIJKLMNOPRSTUWZ";
  const used = new Set(room.usedLetters || []);
  const available = alphabet.split('').filter(l => !used.has(l));
  
  if (available.length === 0) {
      await storage.updateRoomStatus(roomId, 'finished');
      return;
  }

  const letter = available[Math.floor(Math.random() * available.length)];
  
  await storage.addUsedLetter(roomId, letter);
  await storage.updateRoomRound(roomId, room.roundNumber + 1);
  await storage.createRound(roomId, letter);
}

async function validateRound(roundId: number, letter: string) {
  const round = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
  if (!round.length) return;
  const roomId = round[0].roomId;
  const room = await storage.getRoomById(roomId);
  const categoriesToUse = room?.categories || ['panstwo', 'miasto', 'imie', 'zwierze', 'rzecz', 'roslina'];

  const answers = await storage.getAnswers(roundId);
  const answersByPlayer: Record<number, Record<string, string>> = {};
  
  // Group by player
  for (const ans of answers) {
      if (!answersByPlayer[ans.playerId]) answersByPlayer[ans.playerId] = {};
      answersByPlayer[ans.playerId][ans.category] = ans.word;
  }

  // Group by category to check duplicates
  const answersByCategory: Record<string, string[]> = {};
  for (const ans of answers) {
      if (!answersByCategory[ans.category]) answersByCategory[ans.category] = [];
      answersByCategory[ans.category].push(ans.word.toLowerCase());
  }

  // Validate each unique word-category pair with OpenAI
  const wordsToValidate: { category: string, word: string }[] = [];
  const uniqueKeys = new Set<string>();

  for (const ans of answers) {
      const key = `${ans.category}:${ans.word.toLowerCase()}`;
      if (!uniqueKeys.has(key)) {
          uniqueKeys.add(key);
          wordsToValidate.push({ category: ans.category, word: ans.word });
      }
  }

  if (wordsToValidate.length > 0) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                {
                    role: "system",
                    content: `You are a strict judge for the game 'Państwa-Miasta' (Categories). 
                    Letter is '${letter}'. 
                    Check if the word is valid for the category and starts with the letter. 
                    Allow minor typos. 
                    Categories in this game: ${categoriesToUse.join(', ')}.
                    Respond with JSON object where keys are 'category:word' (lowercase) and value is { isValid: boolean, reason: string }.`
                },
                {
                    role: "user",
                    content: JSON.stringify(wordsToValidate.map(w => `${w.category}:${w.word.toLowerCase()}`))
                }
            ],
            response_format: { type: "json_object" }
        });

        const validationResults = JSON.parse(response.choices[0].message.content || "{}");
        
        // Apply scores
        for (const ans of answers) {
            const key = `${ans.category}:${ans.word.toLowerCase()}`;
            // Handle if validationResults structure matches key or is different
            // The prompt asked for keys as 'category:word'
            
            // Note: GPT might return object with keys matching input array strings
            const result = validationResults[key] || { isValid: false, reason: "AI error" };
            
            let points = 0;
            if (result.isValid) {
                // Check duplicates
                const count = answersByCategory[ans.category].filter(w => w === ans.word.toLowerCase()).length;
                points = count > 1 ? 5 : 10;
                
                // If only one player has valid answer in this category? 
                // Too complex for MVP, stick to 10/5.
            }

            await storage.updateAnswerValidation(ans.id, result.isValid, points, result.reason);
            
            if (points > 0) {
                await storage.updatePlayerScore(ans.playerId, points);
            }
        }

    } catch (e) {
        console.error("AI Validation failed", e);
        // Fallback: Mark all valid? Or invalid?
        // Mark pending?
    }
  }
}
