import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useRoom, getSession, clearSession, useStartGame, useSubmitAnswers, useUpdateCategories, useUpdateSettings, queryClient } from "@/hooks/use-game";
import { Button } from "@/components/Button";
import { GameCard } from "@/components/GameCard";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/Input";
import { CATEGORIES, type Answer } from "@shared/schema";
import { Loader2, Trophy, Clock, Copy, ArrowRight, Check, X, Crown, Plus, Trash2, Settings, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

export default function Room() {
  const [match, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const session = getSession();
  const { data, isLoading, error } = useRoom(params?.code);
  const { toast } = useToast();
  
  const startGame = useStartGame();
  const submitAnswers = useSubmitAnswers();
  const updateCategories = useUpdateCategories();
  const updateSettings = useUpdateSettings();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Redirect if no session or room code mismatch
  useEffect(() => {
    if (!session || (params?.code && session.code !== params.code)) {
      clearSession();
      setLocation("/");
    }
  }, [session, params, setLocation]);

  // Reset inputs when round changes
  useEffect(() => {
    if (data?.currentRound) {
      setInputs({});
      setHasSubmitted(false);
    }
  }, [data?.currentRound?.id]);

  // Celebration effect for game over
  useEffect(() => {
    if (data?.room.status === "finished") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [data?.room.status]);

  // Timer logic
  useEffect(() => {
    if (data?.currentRound?.firstSubmissionAt && data?.room.timerDuration !== null && data?.currentRound.status === "active") {
      const endTime = new Date(data.currentRound.firstSubmissionAt).getTime() + data.room.timerDuration * 1000;
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) clearInterval(interval);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [data?.currentRound?.firstSubmissionAt, data?.room.timerDuration, data?.currentRound?.status]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GameCard className="text-center max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Room not found</h2>
          <Button onClick={() => setLocation("/")}>Go Home</Button>
        </GameCard>
      </div>
    );
  }

  const { room, players, currentRound, myAnswers } = data;
  const categories = room.categories || CATEGORIES.map(c => c.id);
  const me = players.find(p => p.id === session?.playerId);
  const isHost = me?.isHost;

  const [localRounds, setLocalRounds] = useState<number>(() => room.totalRounds);
  const [localTimer, setLocalTimer] = useState<number | null>(() => room.timerDuration);

  // Sync local state when room data changes (but not while dragging)
  useEffect(() => {
    setLocalRounds(room.totalRounds);
  }, [room.totalRounds]);

  useEffect(() => {
    setLocalTimer(room.timerDuration);
  }, [room.timerDuration]);

  const handleRoundsChange = (val: number) => {
    setLocalRounds(val);
    updateSettings.mutate({ 
      code: room.code, 
      settings: { totalRounds: val } 
    });
  };

  const handleTimerChange = (val: number) => {
    const newDuration = val === 0 ? null : val;
    setLocalTimer(newDuration);
    updateSettings.mutate({ 
      code: room.code, 
      settings: { timerDuration: newDuration } 
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    toast({ title: "Copied!", description: "Room code copied to clipboard" });
  };

  const handleStart = () => {
    startGame.mutate(room.code);
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    const updated = [...categories, newCategory.trim()];
    updateCategories.mutate({ code: room.code, categories: updated });
    setNewCategory("");
  };

  const handleRemoveCategory = (catToRemove: string) => {
    const updated = categories.filter((c: string) => c !== catToRemove);
    updateCategories.mutate({ code: room.code, categories: updated });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAnswers.mutate({ code: room.code, answers: inputs });
    setHasSubmitted(true);
  };

  // === WAITING LOBBY ===
  if (room.status === "waiting") {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-2xl md:text-3xl font-black text-primary">Państwa Miasta</h1>
          <div 
            onClick={copyCode}
            className="cursor-pointer bg-white px-4 py-2 rounded-xl shadow-sm border border-border flex items-center gap-2 hover:bg-gray-50 transition"
          >
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Room Code</span>
            <span className="text-xl font-mono font-bold">{room.code}</span>
            <Copy className="w-4 h-4 text-primary ml-2" />
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <GameCard title="Players" icon={<Users className="w-5 h-5" />} className="h-full">
            <div className="space-y-4">
              <AnimatePresence>
                {players.map((player) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-4 p-3 rounded-2xl bg-muted/50"
                  >
                    <Avatar name={player.name} />
                    <div className="flex-1 font-semibold text-lg">{player.name}</div>
                    {player.isHost && <Crown className="w-5 h-5 text-yellow-500" />}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {players.length < 2 && (
                <p className="text-center text-muted-foreground py-4 italic">
                  Waiting for players to join...
                </p>
              )}
            </div>
          </GameCard>

          <div className="space-y-6">
            <GameCard title="Categories" className="bg-primary/5 border-primary/20">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat: string) => (
                    <div key={cat} className="bg-white border rounded-lg px-3 py-1 flex items-center gap-2">
                      <span className="font-medium">{CATEGORIES.find(c => c.id === cat)?.label || cat}</span>
                      {isHost && (
                        <button 
                          onClick={() => handleRemoveCategory(cat)}
                          className="text-red-500 hover:text-red-700 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                {isHost && (
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Add category..."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    />
                    <Button onClick={handleAddCategory} size="icon">
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </div>
            </GameCard>

            <GameCard title="Game Settings" icon={<Settings className="w-5 h-5" />}>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground/80 ml-1 flex justify-between">
                    <span>Rounds</span>
                    <span className="text-primary font-bold">{room.totalRounds}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={localRounds}
                    onChange={(e) => isHost && handleRoundsChange(parseInt(e.target.value))}
                    disabled={!isHost}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground/80 ml-1 flex justify-between">
                    <span>Round Timer (after 1st finish)</span>
                    <span className="text-primary font-bold">{localTimer === null ? "OFF" : `${localTimer}s`}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="5"
                    value={localTimer === null ? 0 : localTimer}
                    onChange={(e) => isHost && handleTimerChange(parseInt(e.target.value))}
                    disabled={!isHost}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                  />
                </div>
              </div>
            </GameCard>

            <GameCard className="bg-primary/5 border-primary/20">
              <h3 className="text-xl font-bold mb-2">Game Rules</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• {room.totalRounds} rounds total</li>
                <li>• Random letter each round</li>
                <li>• Fill all categories fast!</li>
                <li>• Valid answers get points</li>
              </ul>
            </GameCard>

            {isHost ? (
              <Button 
                size="lg" 
                className="w-full text-xl h-16 shadow-xl shadow-primary/20"
                disabled={players.length < 2 || startGame.isPending}
                onClick={handleStart}
              >
                {startGame.isPending ? "Starting..." : "Start Game"}
              </Button>
            ) : (
              <div className="text-center p-6 bg-white rounded-3xl border shadow-sm">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="font-medium text-muted-foreground">Waiting for host to start...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === GAME OVER ===
  if (room.status === "finished") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GameCard className="max-w-2xl w-full text-center py-12">
          <div className="inline-flex p-4 bg-yellow-100 rounded-full text-yellow-600 mb-6 shadow-sm">
            <Trophy className="w-12 h-12" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-2">Game Over!</h1>
          <p className="text-xl text-muted-foreground mb-12">Final Scores</p>

          <div className="space-y-4 max-w-md mx-auto">
            {sortedPlayers.map((player, index) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`
                  flex items-center gap-4 p-4 rounded-2xl border-2
                  ${index === 0 ? "border-yellow-400 bg-yellow-50" : "border-transparent bg-muted/50"}
                `}
              >
                <div className="font-mono font-bold text-2xl text-muted-foreground w-8">
                  #{index + 1}
                </div>
                <Avatar name={player.name} size="md" />
                <div className="flex-1 text-left font-bold text-lg">{player.name}</div>
                <div className="font-black text-2xl">{player.score} pts</div>
              </motion.div>
            ))}
          </div>

          <Button className="mt-12" onClick={() => setLocation("/")}>Back to Menu</Button>
        </GameCard>
      </div>
    );
  }

  // === ACTIVE ROUND ===
  if (currentRound && currentRound.status === "active") {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Round {room.roundNumber}/{room.totalRounds}</span>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-black text-foreground">Letter</span>
              <div className="bg-primary text-white text-4xl font-black w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 transform -rotate-3">
                {currentRound.letter}
              </div>
            </div>
          </div>
          <div className="text-right">
             {timeLeft !== null && (
               <div className="text-2xl font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl mb-2 flex items-center gap-2 border-2 border-red-100">
                 <Clock className="w-6 h-6 animate-pulse" /> {timeLeft}s
               </div>
             )}
             {hasSubmitted ? (
               <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-4 py-2 rounded-xl">
                 <Check className="w-5 h-5" /> Submitted
               </div>
             ) : (
               <div className="flex items-center gap-2 text-orange-500 font-bold bg-orange-50 px-4 py-2 rounded-xl animate-pulse">
                 <Clock className="w-5 h-5" /> Hurry up!
               </div>
             )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {categories.map((catId: string, idx: number) => {
              const catLabel = CATEGORIES.find(c => c.id === catId)?.label || catId.charAt(0).toUpperCase() + catId.slice(1);
              return (
                <motion.div
                  key={catId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <GameCard className="h-full">
                    <Input
                      label={catLabel}
                      placeholder={`Starts with ${currentRound.letter}...`}
                      value={inputs[catId] || ""}
                      onChange={(e) => setInputs(prev => ({ ...prev, [catId]: e.target.value }))}
                      disabled={hasSubmitted}
                      className="text-lg font-medium"
                      autoComplete="off"
                    />
                  </GameCard>
                </motion.div>
              );
            })}
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-border flex justify-center z-10">
            <Button 
              size="lg" 
              className="w-full max-w-md text-xl h-16 shadow-xl"
              disabled={hasSubmitted || submitAnswers.isPending}
            >
              {hasSubmitted ? "Waiting for others..." : "Submit Answers"}
            </Button>
          </div>
          {/* Spacer for fixed footer */}
          <div className="h-24" />
        </form>
      </div>
    );
  }

  // === ROUND RESULTS (Validating/Completed state) ===
  const isRoundOver = currentRound?.status !== "active";
  
  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black mb-2">Round Finished!</h2>
        <p className="text-muted-foreground">Calculating scores...</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <GameCard title="Leaderboard" icon={<Trophy className="w-5 h-5 text-yellow-500" />}>
          <div className="space-y-4">
             {[...players].sort((a,b) => b.score - a.score).map((p, i) => (
               <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                 <div className="flex items-center gap-3">
                   <div className="font-mono font-bold text-muted-foreground w-6">#{i+1}</div>
                   <Avatar name={p.name} size="sm" />
                   <span className="font-semibold">{p.name}</span>
                 </div>
                 <span className="font-bold">{p.score} pts</span>
               </div>
             ))}
          </div>
        </GameCard>

        <GameCard title="Your Answers">
          <div className="space-y-4">
             {categories.map(catId => {
               const catLabel = CATEGORIES.find(c => c.id === catId)?.label || catId.charAt(0).toUpperCase() + catId.slice(1);
               const ans = myAnswers?.find(a => a.category === catId);
               return (
                 <div key={catId} className="flex items-center justify-between p-3 border rounded-xl">
                   <div className="flex flex-col">
                     <span className="text-xs font-bold text-muted-foreground uppercase">{catLabel}</span>
                     <span className="font-medium text-lg">{ans?.word || "-"}</span>
                   </div>
                   <div>
                     {ans?.isValid === true && <div className="text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg text-sm"><Check className="w-4 h-4" /> +{ans.points}</div>}
                     {ans?.isValid === false && <div className="text-red-500 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg text-sm"><X className="w-4 h-4" /> 0</div>}
                     {ans?.isValid === null && <div className="text-yellow-500 font-bold text-sm bg-yellow-50 px-2 py-1 rounded-lg">Checking...</div>}
                   </div>
                 </div>
               );
             })}
          </div>
        </GameCard>
      </div>
      
      {isHost && isRoundOver && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center">
          <Button 
            size="lg" 
            className="shadow-xl animate-bounce"
            onClick={handleStart}
            disabled={startGame.isPending}
          >
            Start Next Round <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      )}

      {!isHost && isRoundOver && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center">
          <div className="bg-white border px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3">
             <Loader2 className="w-5 h-5 animate-spin text-primary" />
             <span className="font-medium">Waiting for host to start next round...</span>
          </div>
        </div>
      )}
    </div>
  );
}
