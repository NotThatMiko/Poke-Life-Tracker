import { useState } from "react";
import { useHabits } from "@/hooks/use-habits";
import { HabitRow } from "@/components/habit-row";
import { HabitForm } from "@/components/habit-form";
import { PixelHeart, PixelSword } from "@/components/ui/pixel-icons";
import { Plus } from "lucide-react";

// Number of days to display in the grid
const DAYS_TO_SHOW = 7;

export default function Home() {
  const { data: habits = [], isLoading, isError } = useHabits();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const completedTodayCount = 0; // In a more complex app, we'd compute this by aggregating logs

  return (
    <div className="min-h-screen pb-24 pt-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      {/* Header Area */}
      <header className="mb-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary border-4 border-border flex items-center justify-center shadow-[4px_4px_0px_0px_#333] transform -rotate-6">
            <PixelHeart className="w-10 h-10 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-display text-4xl sm:text-5xl text-foreground leading-tight drop-shadow-[2px_2px_0px_#fff]">
              Daily Quests
            </h1>
            <p className="font-body text-xl text-muted-foreground mt-2">
              Level up your life, one day at a time!
            </p>
          </div>
        </div>

        <button 
          onClick={() => setIsCreateOpen(true)}
          className="pixel-button bg-accent text-accent-foreground flex items-center gap-2 text-lg px-6 py-3 whitespace-nowrap"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
          <span>New Quest</span>
        </button>
      </header>

      {/* Main Content */}
      <main>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            <p className="font-display text-muted-foreground animate-pulse">Loading Quests...</p>
          </div>
        ) : isError ? (
          <div className="pixel-box bg-destructive/10 p-8 text-center border-destructive">
            <p className="font-display text-destructive text-xl">Oops! Failed to load quests.</p>
            <p className="font-body text-lg mt-2">Please try refreshing the page.</p>
          </div>
        ) : habits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="relative">
              <div className="w-24 h-24 bg-muted border-4 border-border flex items-center justify-center shadow-[6px_6px_0px_0px_#333] rounded-full overflow-hidden">
                <PixelSword className="w-12 h-12 text-muted-foreground" />
              </div>
              <div className="absolute -top-2 -right-2 text-4xl">✨</div>
            </div>
            
            <div className="space-y-2 max-w-md">
              <h2 className="font-display text-2xl text-foreground">Your Quest Log is Empty!</h2>
              <p className="font-body text-xl text-muted-foreground">
                It's dangerous to go alone! Take a moment to define your first daily habit and start your adventure.
              </p>
            </div>
            
            <button 
              onClick={() => setIsCreateOpen(true)}
              className="pixel-button bg-primary text-white text-xl px-8 py-4 mt-4 animate-bounce"
              style={{ animationDuration: '2s' }}
            >
              Start Adventure
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {habits.map((habit) => (
              <HabitRow 
                key={habit.id} 
                habit={habit} 
                daysToMap={DAYS_TO_SHOW} 
              />
            ))}
          </div>
        )}
      </main>

      <HabitForm 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
      />
      
      {/* Cute footer decor */}
      {habits.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-primary/20 to-transparent pointer-events-none" />
      )}
    </div>
  );
}
