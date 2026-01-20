import { Link } from "wouter";
import { GameCard } from "@/components/GameCard";
import { Button } from "@/components/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <GameCard className="text-center">
        <div className="mb-4 text-4xl">🤔</div>
        <h1 className="text-2xl font-bold mb-2">404 Page Not Found</h1>
        <p className="text-muted-foreground mb-6">
          Looks like you've wandered into unknown territory.
        </p>
        <Link href="/">
          <Button>Return Home</Button>
        </Link>
      </GameCard>
    </div>
  );
}
