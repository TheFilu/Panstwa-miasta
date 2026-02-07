import type { Express } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { db } from "./db";
import { rounds, answers as answersTable } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);

  // --- LOGIKA KOŃCZENIA RUNDY ---

  async function finishRoundLogic(roomId: number, roundId: number) {
    const room = await storage.getRoomById(roomId);
    const round = await storage.getCurrentRound(roomId);

    // Jeśli runda już jest zakończona, nic nie rób
    if (!room || !round || round.status === "completed") return;

    console.log(`[Game] Kończenie rundy ${roundId} w pokoju ${room.code}...`);

    // 1. Klucz: Najpierw status 'completed', żeby odblokować UI u wszystkich graczy (polling)
    try {
      const updatedRound = await storage.completeRound(roundId);
      if (!updatedRound) {
        console.error(`[Game] CRITICAL: completeRound returned null for ${roundId}`);
        return;
      }
      console.log(`[Game] Runda ${roundId} oznaczona jako zakończona.`);
    } catch (err) {
      console.error(`[Game] Błąd podczas completeRound:`, err);
      return; // Przerwij jeśli nie udało się oznaczyć jako zakończone
    }

    // 2. Walidacja AI
    // Używamy setTimeout, aby walidacja odbyła się po zakończeniu żądania i nie blokowała głównego wątku
    setTimeout(() => {
      validateRound(roundId, round.letter).catch((err) =>
        console.error("[Game] Błąd walidacji AI:", err),
      );
    }, 100);

    // 3. Sprawdzenie czy to była ostatnia runda gry
    if (room.roundNumber >= room.totalRounds) {
      try {
        await storage.updateRoomStatus(room.id, "finished");
        console.log(`[Game] Gra w pokoju ${room.code} zakończona.`);
      } catch (err) {
        console.error(`[Game] Błąd podczas updateRoomStatus (finished):`, err);
      }
    }
  }

  // --- ENDPOINTY API ---

  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const { playerName, totalRounds, categories, timerDuration } =
        api.rooms.create.input.parse(req.body);
      const room = await storage.createRoom(
        playerName,
        totalRounds,
        categories,
        timerDuration,
      );
      const player = await storage.addPlayer(room.id, playerName, true);
      res.status(201).json({
        code: room.code,
        playerId: player.id,
        token: String(player.id),
      });
    } catch (err) {
      res.status(400).json({ message: "Błąd tworzenia pokoju" });
    }
  });

  app.post(api.rooms.join.path, async (req, res) => {
    try {
      const { code, playerName } = api.rooms.join.input.parse(req.body);
      const room = await storage.getRoom(code);
      if (!room) return res.status(404).json({ message: "Pokój nie istnieje" });
      const player = await storage.addPlayer(room.id, playerName, false);
      res.status(200).json({
        code: room.code,
        playerId: player.id,
        token: String(player.id),
      });
    } catch (err) {
      res.status(500).json({ message: "Błąd dołączania" });
    }
  });

  app.get(api.rooms.get.path, async (req, res) => {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const room = await storage.getRoom(code);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const playersList = await storage.getPlayers(room.id);
    const currentRound = await storage.getCurrentRound(room.id);

    let allAnswers = undefined;
    if (currentRound?.status === "completed") {
      allAnswers = await storage.getAnswers(currentRound.id);
    }

    res.json({ room, players: playersList, currentRound, allAnswers });
  });

  app.post(api.rooms.start.path, async (req, res) => {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    console.log(`[Game] Starting game for room: ${code}`);
    const room = await storage.getRoom(code);
    if (!room) return res.status(404).json({ message: "Room not found" });
    
    // Resetujemy numer rundy do 0 przed wywołaniem startNewRound, która go podbije do 1
    await storage.updateRoomRound(room.id, 0);
    
    await startNewRound(room.id);
    res.json({ success: true });
  });

  app.post(api.rooms.submit.path, async (req, res) => {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const room = await storage.getRoom(code);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error(`[Game] AUTH ERROR: Missing authorization header (Room: ${room.code})`);
      return res.status(401).json({ 
        message: "Brak sesji gracza. Proszę odśwież stronę lub dołącz ponownie.",
      });
    }
    
    const playerId = parseInt(String(authHeader), 10);
    
    if (isNaN(playerId) || playerId <= 0) {
      console.error(`[Game] AUTH ERROR: Invalid playerId from header: "${authHeader}" (Room: ${room.code})`);
      return res.status(401).json({ 
        message: "Nieprawidłowy identyfikator sesji. Proszę odśwież stronę lub dołącz ponownie.",
        debugInfo: { authHeader, playerId }
      });
    }

    const currentRound = await storage.getCurrentRound(room.id);
    if (!currentRound || currentRound.status !== "active") {
      console.log(`[Game] Submit rejected: Round is ${currentRound?.status || 'missing'} for room ${room.code}`);
      return res.status(400).json({ message: "Brak aktywnej rundy" });
    }
    
    const roundId = parseInt(String(currentRound.id), 10);
    if (isNaN(roundId) || roundId <= 0) {
      console.error(`[Game] STATE ERROR: Invalid roundId: ${currentRound.id} (Room: ${room.code})`);
      return res.status(500).json({ message: "Błąd stanu gry: Nieprawidłowy identyfikator rundy." });
    }

    const { answers } = api.rooms.submit.input.parse(req.body);

    // Zapisujemy odpowiedzi gracza
    console.log(`[Game] Player ${playerId} submitting answers for round ${roundId} in room ${room.code}`);
    try {
      await storage.submitAnswers(roundId, playerId, answers);
    } catch (err) {
      console.error(`[Game] DATABASE ERROR in submitAnswers:`, err);
      return res.status(500).json({ message: "Błąd zapisu odpowiedzi w bazie danych" });
    }

    const playersInRoom = await storage.getPlayers(room.id);
    const roundAnswers = await storage.getAnswers(currentRound.id);
    const submittedPlayerIds = new Set(roundAnswers.map((a) => a.playerId));
    
    console.log(`[Game] Status: ${submittedPlayerIds.size}/${playersInRoom.length} players submitted`);

    // LOGIKA TIMER-A: Pierwszy "Stop" (submit) uruchamia zegar
    if (!currentRound.firstSubmissionAt) {
      console.log(`[Game] First submission received. Starting timer or finishing immediately.`);
      await storage.markFirstSubmission(currentRound.id);

      // Jeśli host ustawia 0 lub null, kończymy od razu
      if (!room.timerDuration || room.timerDuration === 0) {
        console.log(`[Game] No timer duration set. Finishing round immediately.`);
        await finishRoundLogic(room.id, currentRound.id);
      }
    }

    // Jeśli wszyscy wysłali przed czasem - kończymy natychmiast
    const allSubmitted = playersInRoom.every(p => submittedPlayerIds.has(p.id));
    console.log(`[Game] All submitted check: ${allSubmitted} (Submitted count: ${submittedPlayerIds.size}, Total players: ${playersInRoom.length})`);
    
    if (allSubmitted && currentRound.status === "active") {
      console.log(`[Game] All ${playersInRoom.length} players submitted. Finishing round immediately.`);
      await finishRoundLogic(room.id, roundId);
    }

    res.json({ success: true });
  });

  // --- BACKGROUND TIMER (Sprawdza co 1s) ---
  setInterval(async () => {
    try {
      const activeRounds = await db
        .select()
        .from(rounds)
        .where(eq(rounds.status, "active"));
      
      for (const round of activeRounds) {
        if (round.firstSubmissionAt) {
          const room = await storage.getRoomById(round.roomId);
          if (room && room.timerDuration !== null && room.timerDuration !== undefined) {
            const firstSubTime = new Date(round.firstSubmissionAt).getTime();
            const now = Date.now();
            const elapsed = (now - firstSubTime) / 1000;
            
            if (elapsed >= room.timerDuration) {
              console.log(`[Timer] Czas minął w pokoju ${room.code} (Runda ${round.id}). Upłynęło: ${elapsed}s, Limit: ${room.timerDuration}s`);
              await finishRoundLogic(room.id, round.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("[Timer] Błąd pętli głównej timera:", e);
    }
  }, 1000);

  app.post(api.rooms.nextRound.path, async (req, res) => {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const room = await storage.getRoom(code);
    if (room && room.status !== "finished") {
      await startNewRound(room.id);
      res.json({ success: true });
    } else {
      res.status(400).json({ message: "Game finished" });
    }
  });

  return httpServer;
}

// --- FUNKCJE POMOCNICZE (validateRound i startNewRound zostają bez zmian z Twojego poprzedniego kodu) ---

async function startNewRound(roomId: number) {
  const room = await storage.getRoomById(roomId);
  if (!room) return;
  const alphabet = "ABCDEFGHIJKLMNOPRSTUWZ";
  const used = new Set(room.usedLetters || []);
  const available = alphabet.split("").filter((l) => !used.has(l));
  if (available.length === 0) {
    await storage.updateRoomStatus(roomId, "finished");
    return;
  }
  const letter = available[Math.floor(Math.random() * available.length)];
  await storage.addUsedLetter(roomId, letter);
  await storage.updateRoomRound(roomId, room.roundNumber + 1);
  await storage.createRound(roomId, letter);
}

async function validateRound(roundId: number, letter: string) {
  const round = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round.length) return;
  const roomId = round[0].roomId;
  const room = await storage.getRoomById(roomId);
  const categoriesToUse = room?.categories || [
    "panstwo",
    "miasto",
    "imie",
    "zwierze",
    "rzecz",
    "roslina",
  ];

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
  const wordsToValidate: { category: string; word: string }[] = [];
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
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a strict judge for the game 'Państwa-Miasta' (Categories). 
                    Letter is '${letter}'. 
                    Check if the word is valid for the category and starts with the letter. 
                    Allow minor typos. 
                    Categories in this game: ${categoriesToUse.join(", ")}.
                    Respond ONLY with a JSON object where keys are 'category:word' (exactly as provided in input, lowercase) and value is { "isValid": boolean, "reason": string }.`,
          },
          {
            role: "user",
            content: JSON.stringify(
              wordsToValidate.map(
                (w) => `${w.category}:${w.word.toLowerCase()}`,
              ),
            ),
          },
        ],
        response_format: { type: "json_object" },
      });

      const validationResults = JSON.parse(
        response.choices[0].message.content || "{}",
      );
      console.log(
        `[Game] Validation results for round ${roundId}:`,
        validationResults,
      );

      // Apply scores
      for (const ans of answers) {
        const key = `${ans.category}:${ans.word.toLowerCase()}`;
        // Handle if validationResults structure matches key or is different
        // The prompt asked for keys as 'category:word'

        // Note: GPT might return object with keys matching input array strings
        const result = validationResults[key] || {
          isValid: false,
          reason: "AI error",
        };

        let points = 0;
        if (result.isValid) {
          // Check duplicates
          const count = answersByCategory[ans.category].filter(
            (w) => w === ans.word.toLowerCase(),
          ).length;
          points = count > 1 ? 5 : 10;
        }

        await storage.updateAnswerValidation(
          ans.id,
          result.isValid,
          points,
          result.reason,
        );

        if (points > 0) {
          await storage.updatePlayerScore(ans.playerId, points);
        }
      }
    } catch (e) {
      console.error("AI Validation failed:", e);

      // FALLBACK: Jeśli AI zawiedzie, dajemy 10 pkt za każde słowo,
      // żeby nie blokować gry!
      for (const ans of answers) {
        await storage.updateAnswerValidation(
          ans.id,
          true,
          10,
          "Fallback (AI Error)",
        );
        await storage.updatePlayerScore(ans.playerId, 10);
      }
    }
  }
}
