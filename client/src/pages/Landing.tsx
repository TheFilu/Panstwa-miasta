import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateRoom, useJoinRoom } from "@/hooks/use-game";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { GameCard } from "@/components/GameCard";
import { useToast } from "@/hooks/use-toast";
import { Play, Users, Globe2, Loader2 } from "lucide-react";

export default function Landing() {
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState(5);
  const [categories, setCategories] = useState(
    "państwo, miasto, imię, zwierzę, rzecz, roślina",
  );

  const createRoom = useCreateRoom();
  const joinRoom = useJoinRoom();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const categoryList = categories
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      console.log("[Lobby] Creating room with:", {
        name,
        rounds,
        categoryList,
      });
      await createRoom.mutateAsync({
        playerName: name,
        totalRounds: rounds,
        timerDuration: 10,
        categories: categoryList.length > 0 ? categoryList : undefined,
      });
    } catch (error: any) {
      console.error("[Lobby] Create room error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    try {
      await joinRoom.mutateAsync({ playerName: name, code });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2 mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="flex justify-center mb-4"
          >
            <div className="bg-white p-4 rounded-3xl shadow-xl shadow-primary/20">
              <Globe2 className="w-16 h-16 text-primary" />
            </div>
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black text-primary drop-shadow-sm tracking-tight">
            Państwa Miasta
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Klasyczna gra słowna w nowej odsłonie.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {mode === "menu" && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid gap-4"
            >
              <GameCard className="p-1">
                <Button
                  size="lg"
                  className="w-full text-xl h-20"
                  onClick={() => setMode("create")}
                >
                  <Play className="mr-3 w-6 h-6" />
                  Stwórz pokój
                </Button>
                <div className="h-4" />
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full text-xl h-20"
                  onClick={() => setMode("join")}
                >
                  <Users className="mr-3 w-6 h-6" />
                  Dołącz
                </Button>
              </GameCard>
            </motion.div>
          )}

          {mode === "create" && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <GameCard title="Create New Game" variant="primary">
                <form onSubmit={handleCreate} className="space-y-6">
                  <Input
                    label="Your Name"
                    placeholder="Enter your nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground/80 ml-1">
                      Rounds: {rounds}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={rounds}
                      onChange={(e) => setRounds(parseInt(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                  <Input
                    label="Categories (comma separated)"
                    placeholder="e.g. panstwo, miasto, imie"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                  />
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setMode("menu")}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={!name.trim()}
                      isLoading={createRoom.isPending}
                    >
                      Create Lobby
                    </Button>
                  </div>
                </form>
              </GameCard>
            </motion.div>
          )}

          {mode === "join" && (
            <motion.div
              key="join"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <GameCard title="Join Game" variant="secondary">
                <form onSubmit={handleJoin} className="space-y-6">
                  <Input
                    label="Room Code"
                    placeholder="e.g. A1B2"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoFocus
                  />
                  <Input
                    label="Your Name"
                    placeholder="Enter your nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setMode("menu")}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="flex-1"
                      disabled={!name.trim() || !code.trim()}
                      isLoading={joinRoom.isPending}
                    >
                      Join Game
                    </Button>
                  </div>
                </form>
              </GameCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
