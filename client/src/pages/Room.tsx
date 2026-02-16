import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useRoom,
  getSession,
  clearSession,
  useStartGame,
  useNextRound,
  useSubmitAnswers,
  useVoteAnswer,
  useUpdateCategories,
  useUpdateSettings,
  queryClient,
} from "@/hooks/use-game";
import { Button } from "@/components/Button";
import { GameCard } from "@/components/GameCard";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/Input";
import { CATEGORIES, type Answer } from "@shared/schema";
import {
  Loader2,
  Trophy,
  Clock,
  Copy,
  ArrowRight,
  Check,
  X,
  Crown,
  Plus,
  Trash2,
  Settings,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

export default function Room() {
  const [match, params] = useRoute("/room/:code");
  const [, setLocation] = useLocation();
  const session = getSession();
  const { data, isLoading, error } = useRoom(params?.code);
  const { toast } = useToast();

  useEffect(() => {
    if (!session || (params?.code && session.code !== params.code)) {
      clearSession();
      setLocation("/");
    }
  }, [session, params, setLocation]);

  useEffect(() => {
    if (data?.room.status === "finished") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [data?.room.status]);

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
          <h2 className="text-2xl font-bold mb-4">Pokój nie znaleziony</h2>
          <Button onClick={() => setLocation("/")}>Wróć do domu</Button>
        </GameCard>
      </div>
    );
  }

  const { room, players, currentRound, myAnswers, allAnswers, answerVotes } = data;
  const categories = room.categories || CATEGORIES.map((c) => c.id);
  const me = players.find((p) => p.id === session?.playerId);
  const isHost = me?.isHost;

  return (
    <RoomContent
      room={room}
      players={players}
      currentRound={currentRound}
      myAnswers={myAnswers}
      allAnswers={allAnswers}
      answerVotes={answerVotes}
      categories={categories}
      isHost={isHost}
      session={session}
      setLocation={setLocation}
    />
  );
}

function RoomContent({
  room,
  players,
  currentRound,
  myAnswers,
  allAnswers,
  answerVotes,
  categories,
  isHost,
  session,
  setLocation,
}: {
  room: any;
  players: any[];
  currentRound: any;
  myAnswers: any[] | undefined;
  allAnswers: any[] | undefined;
  answerVotes: any[] | undefined;
  categories: string[];
  isHost: boolean | undefined;
  session: any;
  setLocation: any;
}) {
  const { toast } = useToast();
  const startGame = useStartGame();
  const nextRound = useNextRound();
  const submitAnswers = useSubmitAnswers();
  const voteAnswer = useVoteAnswer();
  const updateCategories = useUpdateCategories();
  const updateSettings = useUpdateSettings();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [localRounds, setLocalRounds] = useState<number>(room.totalRounds);
  const [localTimer, setLocalTimer] = useState<number | null>(
    room.timerDuration,
  );
  const autoSubmitTriggered = useRef(false);
  const formatCategoryLabel = (categoryId: string) => {
    const label = CATEGORIES.find((c) => c.id === categoryId)?.label;
    if (label) return label;
    if (!categoryId) return categoryId;
    return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
  };

  const answersByPlayerCategory = new Map<string, any>();
  (allAnswers || []).forEach((ans) => {
    answersByPlayerCategory.set(`${ans.playerId}:${ans.category}`, ans);
  });

  const votesByAnswerId = new Map<number, { accept: number; reject: number; myVote?: boolean }>();
  (answerVotes || []).forEach((vote) => {
    const entry = votesByAnswerId.get(vote.answerId) || { accept: 0, reject: 0 };
    if (vote.accepted) {
      entry.accept += 1;
    } else {
      entry.reject += 1;
    }
    if (vote.playerId === session?.playerId) {
      entry.myVote = vote.accepted;
    }
    votesByAnswerId.set(vote.answerId, entry);
  });

  const myAnswersResolved =
    myAnswers || allAnswers?.filter((ans) => ans.playerId === session?.playerId);

  const getVoteStats = (answerId: number) =>
    votesByAnswerId.get(answerId) || { accept: 0, reject: 0 };

  const isAnswerRejected = (answer: any) => {
    const stats = getVoteStats(answer.id);
    return answer.communityRejected || stats.reject > players.length / 2;
  };

  useEffect(() => {
    setLocalRounds(room.totalRounds);
  }, [room.totalRounds]);
  useEffect(() => {
    setLocalTimer(room.timerDuration);
  }, [room.timerDuration]);

  // Reset inputs when round changes
  useEffect(() => {
    if (currentRound?.status === "active") {
      setInputs({});
      setHasSubmitted(false);
      setTimeLeft(null);
      autoSubmitTriggered.current = false;
    }
  }, [currentRound?.id, currentRound?.status]);

  useEffect(() => {
    if (
      currentRound?.firstSubmissionAt &&
      room.timerDuration !== null &&
      currentRound.status === "active"
    ) {
      const endTime =
        new Date(currentRound.firstSubmissionAt).getTime() +
        room.timerDuration * 1000;
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) clearInterval(interval);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [
    currentRound?.firstSubmissionAt,
    room.timerDuration,
    currentRound?.status,
  ]);

  useEffect(() => {
    if (
      timeLeft === 0 &&
      currentRound?.status === "active" &&
      !hasSubmitted &&
      !submitAnswers.isPending &&
      !autoSubmitTriggered.current
    ) {
      autoSubmitTriggered.current = true;
      submitAnswers.mutate({ code: room.code, answers: inputs });
      setHasSubmitted(true);
    }
  }, [
    timeLeft,
    currentRound?.status,
    hasSubmitted,
    submitAnswers,
    room.code,
    inputs,
  ]);

  const handleRoundsChange = (val: number) => {
    setLocalRounds(val);
    updateSettings.mutate({ code: room.code, settings: { totalRounds: val } });
  };

  const handleTimerChange = (val: number) => {
    const newDuration = val === 0 ? null : val;
    setLocalTimer(newDuration);
    updateSettings.mutate({
      code: room.code,
      settings: { timerDuration: newDuration },
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    toast({ title: "Skopiowano!", description: "Kod pokoju skopiowany do schowka" });
  };

  const handleStart = () => startGame.mutate(room.code);
  const handleNextRound = () => nextRound.mutate(room.code);
  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    const updated = [...categories, newCategory.trim()];
    console.log("[Room] Adding category", { code: room.code, categories: updated });
    updateCategories
      .mutateAsync({ code: room.code, categories: updated })
      .then(() => setNewCategory(""))
      .catch((err) => {
        console.error("[Room] updateCategories error:", err);
        toast({ title: "Błąd", description: err.message || String(err), variant: "destructive" });
      });
  };

  const handleRemoveCategory = (catToRemove: string) => {
    const updated = categories.filter((c: string) => c !== catToRemove);
    console.log("[Room] Removing category", { code: room.code, categories: updated });
    updateCategories
      .mutateAsync({ code: room.code, categories: updated })
      .catch((err) => {
        console.error("[Room] updateCategories error:", err);
        toast({ title: "Błąd", description: err.message || String(err), variant: "destructive" });
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAnswers.mutate({ code: room.code, answers: inputs });
    setHasSubmitted(true);
  };

  // === RENDER LOGIC ===

  // 1. WAITING LOBBY
  if (room.status === "waiting") {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-2xl md:text-3xl font-black text-primary">
            Państwa Miasta
          </h1>
          <div
            onClick={copyCode}
            className="cursor-pointer bg-white px-4 py-2 rounded-xl shadow-sm border border-border flex items-center gap-2 hover:bg-gray-50 transition"
          >
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Kod pokoju
            </span>
            <span className="text-xl font-mono font-bold">{room.code}</span>
            <Copy className="w-4 h-4 text-primary ml-2" />
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <GameCard
            title="Gracze"
            icon={<Users className="w-5 h-5" />}
            className="h-full"
          >
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
                    <div className="flex-1 font-semibold text-lg">
                      {player.name}
                    </div>
                    {player.isHost && (
                      <Crown className="w-5 h-5 text-yellow-500" />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </GameCard>

          <div className="space-y-6">
            <GameCard
              title="Kategorie"
              className="bg-primary/5 border-primary/20"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat: string) => (
                    <div
                      key={cat}
                      className="bg-white border rounded-lg px-3 py-1 flex items-center gap-2"
                    >
                      <span className="font-medium">
                        {formatCategoryLabel(cat)}
                      </span>
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(cat)}
                          className="text-red-500"
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
                      placeholder="Dodaj kategorię..."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddCategory()
                      }
                    />
                    <Button type="button" onClick={handleAddCategory} size="sm">
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </div>
            </GameCard>

            <GameCard title="Ustawienia" icon={<Settings className="w-5 h-5" />}>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold flex justify-between">
                    <span>Rundy</span>
                    <span className="text-primary">{room.totalRounds}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={localRounds}
                    onChange={(e) =>
                      isHost && handleRoundsChange(parseInt(e.target.value))
                    }
                    disabled={!isHost}
                    className="w-full h-2 accent-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold flex justify-between">
                    <span>Czas na odpowiedź</span>
                    <span className="text-primary">
                      {localTimer === null ? "WYŁĄCZONY" : `${localTimer}s`}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="5"
                    value={localTimer === null ? 0 : localTimer}
                    onChange={(e) =>
                      isHost && handleTimerChange(parseInt(e.target.value))
                    }
                    disabled={!isHost}
                    className="w-full h-2 accent-primary"
                  />
                </div>
              </div>
            </GameCard>

            {isHost ? (
              <Button
                size="lg"
                className="w-full h-16 text-xl shadow-xl"
                disabled={players.length < 2 || startGame.isPending}
                onClick={handleStart}
              >
                {startGame.isPending ? "Uruchamiam..." : "Rozpocznij grę"}
              </Button>
            ) : (
              <div className="text-center p-6 bg-white rounded-3xl border">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="font-medium text-muted-foreground">
                  Oczekiwanie na hosta...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. GAME OVER
  if (room.status === "finished") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GameCard className="max-w-2xl w-full text-center py-12">
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black mb-12">Koniec gry!</h1>
          <div className="space-y-4 max-w-md mx-auto">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${index === 0 ? "border-yellow-400 bg-yellow-50" : "bg-muted/50"}`}
              >
                <span className="font-bold text-xl w-8">#{index + 1}</span>
                <Avatar name={player.name} />
                <div className="flex-1 text-left font-bold">{player.name}</div>
                <div className="font-black text-xl">{player.score} pts</div>
              </div>
            ))}
          </div>
          <Button className="mt-12" onClick={() => setLocation("/")}>
            Wróć do menu
          </Button>
        </GameCard>
      </div>
    );
  }

  // 3. ACTIVE ROUND
  if (currentRound && currentRound.status === "active") {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <span className="text-sm font-bold text-muted-foreground uppercase">
              Runda {room.roundNumber}/{room.totalRounds}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-black">Litera</span>
              <div className="bg-primary text-white text-4xl font-black w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg">
                {currentRound.letter}
              </div>
            </div>
          </div>
          <div className="text-right">
            {timeLeft !== null && (
              <div className="text-2xl font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl flex items-center gap-2">
                <Clock /> {timeLeft}s
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((catId: string) => (
              <GameCard key={catId}>
                <Input
                  label={formatCategoryLabel(catId)}
                  placeholder={`Zaczynając się od ${currentRound.letter}...`}
                  value={inputs[catId] || ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [catId]: e.target.value }))
                  }
                  // Kluczowa zmiana: sprawdzamy też czy runda w ogóle jest jeszcze aktywna
                  disabled={hasSubmitted || currentRound.status !== "active"}
                  autoComplete="off"
                />
              </GameCard>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t flex justify-center z-10">
            <Button
              size="lg"
              className="w-full max-w-md h-16 text-xl shadow-xl"
              // Jeśli status rundy zmieni się na serwerze, przycisk powinien zniknąć/zmienić się
              disabled={
                hasSubmitted ||
                submitAnswers.isPending ||
                currentRound.status !== "active"
              }
            >
              {hasSubmitted ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" /> Czekam na innych...
                </div>
              ) : (
                "Wyślij odpowiedzi"
              )}
            </Button>
          </div>
          <div className="h-24" />
        </form>
      </div>
    );
  }

  // 4. ROUND RESULTS (Default view)
  const isRoundOver = currentRound?.status !== "active";
  const totalPlayers = players.length;
  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black">Runda skończona!</h2>
        <p className="text-muted-foreground">Przegląd odpowiedzi...</p>
      </div>
      <div className="space-y-8">
        <GameCard title="Odpowiedzi graczy" icon={<Users className="w-5 h-5" />}>
          {!allAnswers?.length ? (
            <div className="text-muted-foreground">Brak odpowiedzi w tej rundzie.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-bold">Kategoria</th>
                    {players.map((player) => (
                      <th key={player.id} className="py-2 pr-4 font-bold">
                        {player.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((catId) => (
                    <tr key={catId} className="border-t">
                      <td className="py-3 pr-4 font-semibold">
                        {formatCategoryLabel(catId)}
                      </td>
                      {players.map((player) => {
                        const ans = answersByPlayerCategory.get(`${player.id}:${catId}`);
                        if (!ans) {
                          return (
                            <td key={player.id} className="py-3 pr-4 text-muted-foreground">
                              -
                            </td>
                          );
                        }

                        const voteStats = getVoteStats(ans.id);
                        const rejectedNow = voteStats.reject > totalPlayers / 2;
                        const rejectedFinal = ans.communityRejected;
                        const myVote = voteStats.myVote;

                        return (
                          <td key={player.id} className="py-3 pr-4 align-top">
                            <div className="flex flex-col gap-2">
                              <div className="font-semibold">{ans.word}</div>
                              <div className="text-xs text-muted-foreground">
                                Głosy: +{voteStats.accept} / -{voteStats.reject}
                              </div>
                              {rejectedFinal && (
                                <div className="text-xs font-bold text-red-500">
                                  Odrzucone po zamknięciu rundy
                                </div>
                              )}
                              {!rejectedFinal && rejectedNow && (
                                <div className="text-xs font-bold text-red-500">
                                  Aktualnie odrzucane
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={myVote === true ? "secondary" : "outline"}
                                  onClick={() =>
                                    voteAnswer.mutate({
                                      code: room.code,
                                      answerId: ans.id,
                                      accepted: true,
                                    })
                                  }
                                  disabled={voteAnswer.isPending}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={myVote === false ? "destructive" : "outline"}
                                  onClick={() =>
                                    voteAnswer.mutate({
                                      code: room.code,
                                      answerId: ans.id,
                                      accepted: false,
                                    })
                                  }
                                  disabled={voteAnswer.isPending}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GameCard>

        <div className="grid md:grid-cols-2 gap-8">
          <GameCard
            title="Ranking"
            icon={<Trophy className="w-5 h-5 text-yellow-500" />}
          >
            <div className="space-y-4">
              {[...players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-muted-foreground w-6">
                        #{i + 1}
                      </span>
                      <Avatar name={p.name} size="sm" />
                      <span className="font-semibold">{p.name}</span>
                    </div>
                    <span className="font-bold">{p.score} pts</span>
                  </div>
                ))}
            </div>
          </GameCard>

          <GameCard title="Twoje odpowiedzi">
            <div className="space-y-4">
              {categories.map((catId) => {
                const ans = myAnswersResolved?.find((a) => a.category === catId);
                const rejected = ans ? isAnswerRejected(ans) : false;
                return (
                  <div
                    key={catId}
                    className="flex items-center justify-between p-3 border rounded-xl"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-muted-foreground uppercase">
                        {formatCategoryLabel(catId)}
                      </span>
                      <span className="font-medium text-lg">
                        {ans?.word || "-"}
                      </span>
                    </div>
                    {ans?.isValid === true && (
                      <div className={rejected ? "text-red-500 font-bold" : "text-green-600 font-bold"}>
                        {rejected ? 0 : `+ ${ans.points}`}
                      </div>
                    )}
                    {ans?.isValid === false && (
                      <div className="text-red-500 font-bold">0</div>
                    )}
                  </div>
                );
              })}
            </div>
          </GameCard>
        </div>
      </div>

      {isHost && isRoundOver && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center">
          <Button
            size="lg"
            className="shadow-xl animate-bounce"
            onClick={handleNextRound}
            disabled={nextRound.isPending}
          >
            Następna runda <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
