import { useState } from "react";
import { useHabits } from "@/hooks/use-habits";
import { HabitRow } from "@/components/habit-row";
import { HabitForm } from "@/components/habit-form";
import { PixelHeart, PixelSword } from "@/components/ui/pixel-icons";
import { Plus } from "lucide-react";
import cloudornImg from "@assets/CLOUDORN_1771781826895.png";

// Number of days to display in the grid
const DAYS_TO_SHOW = 7;

export default function Home() {
  const { data: habits = [], isLoading, isError } = useHabits();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden">
      {/* Background Hero Image */}
      <div 
        className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${cloudornImg})` }}
      />
      
      <div className="relative z-10 pt-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Header Area */}
        <header className="mb-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-card border-4 border-primary flex items-center justify-center shadow-lg animate-float relative">
              <div className="absolute inset-0 bg-primary/20 blur-md" />
              <PixelHeart className="w-12 h-12 text-primary relative z-10" />
            </div>
            <div>
              <h1 className="font-display text-3xl sm:text-5xl text-foreground leading-tight glow-text">
                Space Missions
              </h1>
              <p className="font-body text-2xl text-secondary mt-2 uppercase tracking-widest">
                Lighting speed habit tracker
              </p>
            </div>
          </div>

          <button 
            onClick={() => setIsCreateOpen(true)}
            className="pixel-button bg-transparent border-primary text-foreground flex items-center gap-3 text-lg px-8 py-4 whitespace-nowrap glow-text"
          >
            <Plus className="w-6 h-6 stroke-[4]" />
            <span>New Mission</span>
          </button>
        </header>

        {/* Main Content */}
        <main>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="font-display text-primary text-sm animate-pulse">Scanning Galaxy...</p>
            </div>
          ) : isError ? (
            <div className="pixel-box bg-destructive/20 p-10 text-center border-destructive">
              <p className="font-display text-destructive text-xl">System Failure! Connection Lost.</p>
              <p className="font-body text-2xl mt-4">Please restart your engine (refresh page).</p>
            </div>
          ) : habits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-8">
              <div className="relative animate-float">
                <div className="w-32 h-32 bg-card border-4 border-primary/50 flex items-center justify-center shadow-2xl rounded-full overflow-hidden">
                  <PixelSword className="w-16 h-16 text-secondary" />
                </div>
                <div className="absolute -top-4 -right-4 text-5xl">☁️</div>
              </div>
              
              <div className="space-y-4 max-w-lg">
                <h2 className="font-display text-2xl text-foreground glow-text">Your Mission Log is Empty</h2>
                <p className="font-body text-2xl text-muted-foreground">
                  The universe is waiting for you! Launch your first mission and conquer your daily habits.
                </p>
              </div>
              
              <button 
                onClick={() => setIsCreateOpen(true)}
                className="pixel-button bg-primary text-primary-foreground text-xl px-10 py-5 mt-6 animate-pulse"
              >
                Launch First Mission
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {habits.map((habit) => (
                <div key={habit.id} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-secondary/30 blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
                  <div className="relative">
                    <HabitRow 
                      habit={habit} 
                      daysToMap={DAYS_TO_SHOW} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <HabitForm 
          open={isCreateOpen} 
          onOpenChange={setIsCreateOpen} 
        />
      </div>
      
      {/* Space decorative elements */}
      <div className="fixed top-1/4 left-10 text-4xl opacity-20 animate-float pointer-events-none">⭐</div>
      <div className="fixed bottom-1/4 right-10 text-4xl opacity-20 animate-float pointer-events-none" style={{ animationDelay: '1s' }}>☁️</div>
    </div>
  );
}
