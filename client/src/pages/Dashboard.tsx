import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import TopBar from "@/components/TopBar";
import ExerciseCard from "@/components/ExerciseCard";
import SessionModal from "@/components/SessionModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Exercise, TrainingSession } from "@shared/schema";
import { CATEGORY_SOLID_COLORS, CATEGORY_ICONS } from "@/lib/types";

interface DashboardStats {
  totalSessions: number;
  activePlayersCount: number;
  totalExercises: number;
  avgAttendance: number;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });

  const { data: exercises = [], isLoading: exercisesLoading } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Get upcoming sessions (next 3)
  const upcomingSessions = sessions.slice(0, 3);
  
  // Get recent exercises (last 3 added)
  const recentExercises = exercises.slice(-3);

  // Calculate exercise counts by category
  const exercisesByCategory = exercises.reduce((acc, exercise) => {
    acc[exercise.category] = (acc[exercise.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Navigation functions
  const navigateToPage = (path: string) => {
    setLocation(path);
  };

  const handleCategoryClick = (category: string) => {
    navigateToPage(`/exercise-library?category=${category}`);
  };

  const handleSessionClick = (sessionId: number) => {
    navigateToPage('/weekly-schedule');
  };

  const handleExerciseClick = (exerciseId: number) => {
    navigateToPage('/exercise-library');
  };

  if (statsLoading || sessionsLoading || exercisesLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar 
          title="Dashboard" 
          subtitle="Welcome back! Here's what's happening with your team."
          showNewSessionButton={true}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar 
        title="Dashboard" 
        subtitle="Welcome back! Here's what's happening with your team."
        showNewSessionButton={true}
      />
      
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.totalSessions || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-calendar-check text-blue-600 text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-green-600 font-medium">+12%</span>
                <span className="text-gray-500 ml-2">from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Players</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.activePlayersCount || 0}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-users text-orange-600 text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-green-600 font-medium">+2</span>
                <span className="text-gray-500 ml-2">new this week</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Exercise Library</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.totalExercises || 0}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-dumbbell text-purple-600 text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-green-600 font-medium">+8</span>
                <span className="text-gray-500 ml-2">added this week</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Attendance</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.avgAttendance || 0}%</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-chart-line text-green-600 text-xl"></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-green-600 font-medium">+5%</span>
                <span className="text-gray-500 ml-2">improvement</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upcoming Sessions */}
          <div className="lg:col-span-2">
            <Card className="basketball-card border-0 shadow-xl slide-up">
              <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-white to-orange-50 rounded-t-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 basketball-orange rounded-xl flex items-center justify-center">
                    <i className="fas fa-calendar-week text-white"></i>
                  </div>
                  <CardTitle className="text-xl">Upcoming Training Sessions</CardTitle>
                </div>
                <Button 
                  variant="link" 
                  className="text-basketball-orange hover:text-basketball-orange-hover font-semibold"
                  onClick={() => navigateToPage('/training-sessions')}
                >
                  View All →
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {upcomingSessions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No upcoming sessions scheduled</p>
                ) : (
                  upcomingSessions.map((session) => (
                    <div 
                      key={session.id} 
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-white rounded-xl hover:from-orange-100 hover:to-orange-50 transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-basketball-orange transform hover:scale-102 hover:shadow-lg group"
                      onClick={() => handleSessionClick(session.id)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 basketball-orange rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                          <i className="fas fa-basketball-ball text-white text-lg pulse-orange"></i>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 group-hover:text-basketball-orange transition-colors">{session.name}</h4>
                          <div className="flex items-center space-x-2 mt-1">
                            <div className="flex items-center space-x-1 text-sm text-gray-500">
                              <i className="fas fa-calendar text-basketball-orange text-xs"></i>
                              <span>{session.date}</span>
                            </div>
                            <div className="flex items-center space-x-1 text-sm text-gray-500">
                              <i className="fas fa-clock text-basketball-orange text-xs"></i>
                              <span>{session.time}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center space-x-2 mb-1">
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-users text-green-600 text-xs"></i>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            {session.attendanceCount}/{session.totalPlayers}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-green-600">
                            {Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Exercise Categories */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full basketball-orange basketball-orange-hover text-white"
                  onClick={() => setIsSessionModalOpen(true)}
                >
                  <i className="fas fa-plus mr-2"></i>
                  Create Training Session
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigateToPage('/exercise-library')}
                >
                  <i className="fas fa-dumbbell mr-2"></i>
                  Add New Exercise
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigateToPage('/players')}
                >
                  <i className="fas fa-user-plus mr-2"></i>
                  Add Player
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigateToPage('/weekly-schedule')}
                >
                  <i className="fas fa-calendar-week mr-2"></i>
                  Weekly Schedule
                </Button>
              </CardContent>
            </Card>

            {/* Exercise Categories */}
            <Card>
              <CardHeader>
                <CardTitle>Exercise Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(exercisesByCategory).map(([category, count]) => {
                  const solidColorClass = CATEGORY_SOLID_COLORS[category as keyof typeof CATEGORY_SOLID_COLORS];
                  const iconClass = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];

                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => handleCategoryClick(category)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 ${solidColorClass} rounded-lg flex items-center justify-center`}>
                          <i className={`${iconClass} text-white text-sm`}></i>
                        </div>
                        <span className="font-medium capitalize">{category}</span>
                      </div>
                      <span className="text-sm text-gray-600">{count} exercises</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 rounded-2xl text-white p-6 shadow-2xl transform hover:scale-105 transition-all duration-300 basketball-pattern relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-white bg-opacity-10 rounded-full -translate-y-10 translate-x-10"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white bg-opacity-10 rounded-full translate-y-8 -translate-x-8"></div>
              
              <div className="relative z-10">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                    <i className="fas fa-robot text-white text-xl pulse-orange"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">AI Coach Assistant</h3>
                    <p className="text-orange-100 text-sm">Smart Training Insights</p>
                  </div>
                </div>
                
                <p className="text-orange-100 text-sm mb-4">Based on your team's recent performance data:</p>
                
                <div className="space-y-3">
                  <div className="bg-white bg-opacity-15 rounded-xl p-3 border border-white border-opacity-20">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 bg-red-400 rounded-lg flex items-center justify-center">
                        <i className="fas fa-shield-alt text-white text-xs"></i>
                      </div>
                      <p className="text-sm font-semibold">Defense Positioning</p>
                    </div>
                    <p className="text-xs text-orange-100">15% more points allowed in paint</p>
                  </div>
                  
                  <div className="bg-white bg-opacity-15 rounded-xl p-3 border border-white border-opacity-20">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 bg-blue-400 rounded-lg flex items-center justify-center">
                        <i className="fas fa-basketball-ball text-white text-xs"></i>
                      </div>
                      <p className="text-sm font-semibold">Free Throw Practice</p>
                    </div>
                    <p className="text-xs text-orange-100">Current: 68% → Target: 75%</p>
                  </div>
                </div>
                
                <Button 
                  className="mt-4 w-full bg-white text-orange-600 hover:bg-gray-100 font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  onClick={() => setIsAIModalOpen(true)}
                >
                  <i className="fas fa-chart-line mr-2"></i>
                  View AI Recommendations
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Exercise Library Preview */}
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Exercises</CardTitle>
            <Button 
              variant="link" 
              className="text-basketball-orange"
              onClick={() => navigateToPage('/exercise-library')}
            >
              Browse Library
            </Button>
          </CardHeader>
          <CardContent>
            {recentExercises.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No exercises in library</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentExercises.map((exercise) => (
                  <ExerciseCard 
                    key={exercise.id} 
                    exercise={exercise} 
                    onClick={() => handleExerciseClick(exercise.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Modal */}
        {isSessionModalOpen && (
          <SessionModal 
            isOpen={isSessionModalOpen} 
            onClose={() => setIsSessionModalOpen(false)} 
          />
        )}

        {/* AI Recommendations Modal */}
        <Dialog open={isAIModalOpen} onOpenChange={setIsAIModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <i className="fas fa-robot text-basketball-orange"></i>
                AI Training Recommendations
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <h4 className="font-semibold text-orange-800 mb-2">Performance Analysis</h4>
                <p className="text-sm text-orange-700">Based on recent training data and player performance metrics.</p>
              </div>

              <div className="space-y-3">
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <i className="fas fa-shield-alt text-red-600 text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">Focus on Defensive Positioning</h5>
                      <p className="text-sm text-gray-600 mt-1">Your team allowed 15% more points in the paint during the last three games. Consider adding more defensive sliding drills.</p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => {
                          setIsAIModalOpen(false);
                          handleCategoryClick('defense');
                        }}
                      >
                        View Defense Exercises
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <i className="fas fa-basketball-ball text-blue-600 text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">Improve Free Throw Shooting</h5>
                      <p className="text-sm text-gray-600 mt-1">Current team average: 68% (Target: 75%). Schedule more shooting practice sessions.</p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => {
                          setIsAIModalOpen(false);
                          handleCategoryClick('shooting');
                        }}
                      >
                        View Shooting Exercises
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <i className="fas fa-running text-green-600 text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">Increase Conditioning Work</h5>
                      <p className="text-sm text-gray-600 mt-1">Player fatigue was noticeable in the 4th quarter. Add more endurance training.</p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => {
                          setIsAIModalOpen(false);
                          handleCategoryClick('conditioning');
                        }}
                      >
                        View Conditioning Exercises
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsAIModalOpen(false)}
                >
                  Close
                </Button>
                <Button 
                  className="flex-1 basketball-orange basketball-orange-hover text-white"
                  onClick={() => {
                    setIsAIModalOpen(false);
                    setIsSessionModalOpen(true);
                  }}
                >
                  Create Training Session
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
