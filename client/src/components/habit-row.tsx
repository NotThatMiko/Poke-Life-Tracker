import { useMemo, useState } from "react";
import { format, subDays, startOfToday } from "date-fns";
import { type Habit } from "@shared/routes";
import { useHabitLogs, useToggleHabitLog } from "@/hooks/use-habits";
import { useHabitLogs as useLogs, useToggleHabitLog as useToggle } from "@/hooks/use-habit-logs";
import { PixelHeart, PixelStar } from "./ui/pixel-icons";
import { Settings2 } from "lucide-react";
import { HabitForm } from "./habit-form";

interface HabitRowProps {
  habit: Habit;
  daysToMap: number;
}

export function HabitRow({ habit, daysToMap }: HabitRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { data: logs = [], isLoading } = useLogs(habit.id);
  const toggleMutation = useToggle(habit.id);

  // Generate the last N days ending in today
  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: daysToMap }).map((_, i) => {
      const date = subDays(today, daysToMap - 1 - i);
      return format(date, 'yyyy-MM-dd');
    });
  }, [daysToMap]);

  const handleToggle = (date: string, isCurrentlyCompleted: boolean) => {
    toggleMutation.mutate({ date, completed: !isCurrentlyCompleted });
  };

  // Fun little easter egg: alternate between heart and star based on habit ID
  const Icon = habit.id % 2 === 0 ? PixelHeart : PixelStar;

  return (
    <>
      <div className="pixel-box p-4 md:p-6 flex flex-col md:flex-row gap-6 items-center group bg-card relative overflow-hidden">
        {/* Subtle background color hint based on habit color */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{ backgroundColor: habit.color }} 
        />

        {/* Habit Info */}
        <div className="flex-1 w-full text-center md:text-left z-10 relative">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
            <div 
              className="w-4 h-4 border-2 border-border" 
              style={{ backgroundColor: habit.color, boxShadow: '2px 2px 0px 0px hsl(var(--border))' }} 
            />
            <h3 className="font-display text-xl sm:text-2xl text-foreground truncate max-w-[200px] sm:max-w-xs" title={habit.title}>
              {habit.title}
            </h3>
            
            <button 
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite ml-auto md:ml-0"
              title="Edit Habit"
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          
          {habit.description && (
            <p className="font-body text-lg text-muted-foreground truncate">
              {habit.description}
            </p>
          )}
        </div>

        {/* Grid of Days */}
        <div className="flex gap-2 sm:gap-3 z-10">
          {days.map((dateStr, idx) => {
            const log = logs.find(l => l.date === dateStr);
            const isCompleted = log?.completed || false;
            
            // Is it today?
            const isToday = idx === days.length - 1;
            const dateObj = new Date(dateStr + 'T00:00:00'); // simple parse
            const dayName = format(dateObj, 'E').substring(0, 2); // 'Mo', 'Tu'

            return (
              <div key={dateStr} className="flex flex-col items-center gap-2">
                <span className={`font-display text-[10px] ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {dayName}
                </span>
                
                <button
                  onClick={() => handleToggle(dateStr, isCompleted)}
                  disabled={isLoading || toggleMutation.isPending && toggleMutation.variables?.date !== dateStr}
                  className={`
                    w-10 h-10 sm:w-12 sm:h-12 border-4 border-border flex items-center justify-center
                    transition-all duration-200 focus:outline-none 
                    ${isCompleted 
                      ? 'bg-white shadow-[inset_0px_-4px_0px_rgba(0,0,0,0.1)]' 
                      : 'bg-muted hover:bg-white'}
                    ${isToday && !isCompleted ? 'animate-pulse' : ''}
                  `}
                  style={{
                    boxShadow: isCompleted 
                      ? `inset 0px -3px 0px 0px ${habit.color}40, 2px 2px 0px 0px hsl(var(--border))` 
                      : '2px 2px 0px 0px hsl(var(--border))',
                    backgroundColor: isCompleted ? '#ffffff' : undefined
                  }}
                  title={format(dateObj, 'MMM do, yyyy')}
                >
                  {isCompleted && (
                    <div className="animate-pop">
                      <Icon className="w-6 h-6 sm:w-7 sm:h-7" color={habit.color} />
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <HabitForm 
        habit={habit} 
        open={isEditing} 
        onOpenChange={setIsEditing} 
      />
    </>
  );
}
