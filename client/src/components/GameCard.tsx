import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GameCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "accent" | "default";
}

export function GameCard({ children, className, title, icon, variant = "default" }: GameCardProps) {
  const variants = {
    default: "bg-white border-border/50 shadow-sm",
    primary: "bg-primary/5 border-primary/20 shadow-primary/5",
    secondary: "bg-secondary/5 border-secondary/20 shadow-secondary/5",
    accent: "bg-accent/5 border-accent/20 shadow-accent/5",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-3xl border p-6 backdrop-blur-sm relative overflow-hidden",
        variants[variant],
        className
      )}
    >
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-6">
          {icon && (
            <div className="p-2 rounded-xl bg-background shadow-sm text-foreground">
              {icon}
            </div>
          )}
          {title && <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>}
        </div>
      )}
      {children}
    </motion.div>
  );
}
