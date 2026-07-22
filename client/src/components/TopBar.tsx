import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionModal from "./SessionModal";
import { useSidebar } from "@/hooks/use-sidebar";

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
  const { openMobile } = useSidebar();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <>
      <header className="bg-gradient-to-r from-white to-orange-50 border-b-2 border-orange-200 px-4 py-3 lg:px-6 lg:py-4 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-32 h-32 basketball-orange opacity-5 rounded-full -translate-y-16 translate-x-16"></div>
        <div className="absolute bottom-0 left-0 w-20 h-20 basketball-orange opacity-10 rounded-full translate-y-10 -translate-x-10"></div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between relative z-10">
          <div className="bounce-in flex items-center gap-3">
            <button
              onClick={openMobile}
              className="lg:hidden w-10 h-10 flex-shrink-0 basketball-orange rounded-xl flex items-center justify-center shadow-lg"
              aria-label="Open navigation menu"
            >
              <i className="fas fa-bars text-white" aria-hidden="true"></i>
            </button>
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <div className="hidden lg:flex w-10 h-10 basketball-orange rounded-xl items-center justify-center shadow-lg">
                  <i className="fas fa-basketball-ball text-white"></i>
                </div>
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">{title}</h2>
              </div>
              <p className="text-sm lg:text-base text-gray-600 lg:ml-[52px]">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:space-x-4">
            {onSearch && (
              <div className="relative slide-up flex-1 lg:flex-none">
                <Input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-12 pr-4 py-2.5 lg:py-3 w-full lg:w-64 border-2 border-orange-200 rounded-xl focus:border-basketball-orange transition-all duration-300 shadow-sm hover:shadow-md"
                />
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-basketball-orange"></i>
              </div>
            )}
            {showNewSessionButton && (
              <Button
                onClick={() => setIsModalOpen(true)}
                className="basketball-orange basketball-orange-hover text-white px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 whitespace-nowrap"
              >
                <i className="fas fa-plus mr-2"></i>
                <span className="hidden sm:inline">New Session</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}

            <div className="hidden lg:flex items-center space-x-2">
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
