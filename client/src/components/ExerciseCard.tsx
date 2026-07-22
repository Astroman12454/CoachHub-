import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Exercise } from "@shared/schema";
import { CATEGORY_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";

interface ExerciseCardProps {
  exercise: Exercise;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ExerciseCard({ exercise, onClick, onEdit, onDelete }: ExerciseCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const categoryColorClass = CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS];
  const categoryIconClass = CATEGORY_ICONS[exercise.category as keyof typeof CATEGORY_ICONS];
  const difficultyColorClass = DIFFICULTY_COLORS[exercise.difficulty as keyof typeof DIFFICULTY_COLORS];

  return (
    <div
      className="basketball-card border-2 border-orange-100 rounded-xl p-5 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105 hover:-translate-y-1 hover:border-basketball-orange group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`w-10 h-10 flex-shrink-0 ${categoryColorClass} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300`}>
            <i className={`${categoryIconClass} text-white`}></i>
          </div>
          <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">
            {exercise.category}
          </Badge>
          <Badge className={`${difficultyColorClass} shadow-sm`}>
            {exercise.difficulty}
          </Badge>
        </div>

        {(onEdit || onDelete) ? (
          // Always visible on mobile/tablet (no hover to reveal them on
          // touch); fades in on hover only once there's room to spare on
          // desktop.
          <div className="flex items-center gap-1.5 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-8 h-8 bg-white shadow-sm border border-gray-200 hover:bg-gray-100 rounded-full flex items-center justify-center"
                aria-label={`Edit ${exercise.name}`}
              >
                <i className="fas fa-edit text-gray-600 text-xs" aria-hidden="true"></i>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="w-8 h-8 bg-white shadow-sm border border-red-200 hover:bg-red-100 rounded-full flex items-center justify-center"
                aria-label={`Delete ${exercise.name}`}
              >
                <i className="fas fa-trash text-red-600 text-xs" aria-hidden="true"></i>
              </button>
            )}
          </div>
        ) : (
          <div className="w-6 h-6 flex-shrink-0 bg-[hsl(16,100%,60%,0.2)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <i className="fas fa-arrow-right text-basketball-orange text-xs"></i>
          </div>
        )}
      </div>

      {exercise.imageUrl && !imageFailed ? (
        <img
          src={exercise.imageUrl}
          alt={exercise.name}
          onError={() => setImageFailed(true)}
          className="w-full h-32 object-cover rounded-xl mb-4 group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className={`w-full h-32 ${categoryColorClass} rounded-xl mb-4 flex items-center justify-center`}>
          <i className={`${categoryIconClass} text-3xl opacity-50`}></i>
        </div>
      )}
      
      <h4 className="font-semibold text-gray-900 mb-2 group-hover:text-basketball-orange transition-colors duration-300">
        {exercise.name}
      </h4>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{exercise.description}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-clock text-orange-600 text-xs"></i>
            </div>
            <span className="text-xs text-gray-600">{exercise.duration} min</span>
          </div>
        </div>
        
        <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center opacity-80 group-hover:opacity-100 transition-all duration-300">
          <i className="fas fa-basketball-ball text-white text-xs"></i>
        </div>
      </div>
    </div>
  );
}
