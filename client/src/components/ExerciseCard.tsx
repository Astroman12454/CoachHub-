import { Badge } from "@/components/ui/badge";
import type { Exercise } from "@shared/schema";
import { CATEGORY_COLORS, DIFFICULTY_COLORS, CATEGORY_ICONS } from "@/lib/types";

interface ExerciseCardProps {
  exercise: Exercise;
  onClick?: () => void;
}

export default function ExerciseCard({ exercise, onClick }: ExerciseCardProps) {
  const categoryColorClass = CATEGORY_COLORS[exercise.category as keyof typeof CATEGORY_COLORS];
  const difficultyColorClass = DIFFICULTY_COLORS[exercise.difficulty as keyof typeof DIFFICULTY_COLORS];

  return (
    <div 
      className="basketball-card border-2 border-orange-100 rounded-xl p-5 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105 hover:-translate-y-1 hover:border-basketball-orange group"
      onClick={onClick}
    >
      <div className="absolute top-3 right-3 w-6 h-6 bg-basketball-orange bg-opacity-20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
        <i className="fas fa-arrow-right text-basketball-orange text-xs"></i>
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 ${categoryColorClass} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300`}>
            <i className={`${CATEGORY_ICONS[exercise.category as keyof typeof CATEGORY_ICONS]} text-white`}></i>
          </div>
          <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">
            {exercise.category}
          </Badge>
        </div>
        <Badge className={`${difficultyColorClass} shadow-sm`}>
          {exercise.difficulty}
        </Badge>
      </div>
      
      {exercise.imageUrl && (
        <img 
          src={exercise.imageUrl} 
          alt={exercise.name}
          className="w-full h-32 object-cover rounded-xl mb-4 group-hover:scale-105 transition-transform duration-300" 
        />
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
