import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionModal from "./SessionModal";

interface TopBarProps {
  title: string;
  subtitle: string;
  showNewSessionButton?: boolean;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
}

export default function TopBar({ 
  title, 
  subtitle, 
  showNewSessionButton = false,
  onSearch,
  searchPlaceholder = "Search..."
}: TopBarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <>
      <header className="bg-gradient-to-r from-white to-orange-50 border-b-2 border-orange-200 px-6 py-4 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-32 h-32 bg-basketball-orange opacity-5 rounded-full -translate-y-16 translate-x-16"></div>
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-basketball-orange opacity-10 rounded-full translate-y-10 -translate-x-10"></div>
        
        <div className="flex items-center justify-between relative z-10">
          <div className="bounce-in">
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-10 h-10 basketball-orange rounded-xl flex items-center justify-center shadow-lg">
                <i className="fas fa-basketball-ball text-white"></i>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            </div>
            <p className="text-gray-600 ml-13">{subtitle}</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {onSearch && (
              <div className="relative slide-up">
                <Input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-12 pr-4 py-3 w-64 border-2 border-orange-200 rounded-xl focus:border-basketball-orange transition-all duration-300 shadow-sm hover:shadow-md"
                />
                <i className="fas fa-search absolute left-4 top-4 text-basketball-orange"></i>
              </div>
            )}
            {showNewSessionButton && (
              <Button 
                onClick={() => setIsModalOpen(true)}
                className="basketball-orange basketball-orange-hover text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <i className="fas fa-plus mr-2"></i>
                New Session
              </Button>
            )}
            
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <i className="fas fa-bell text-white text-sm"></i>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {isModalOpen && (
        <SessionModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </>
  );
}
