import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrainingSession } from "@shared/schema";

export default function TrainingSessions() {
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery<TrainingSession[]>({
    queryKey: ['/api/training-sessions'],
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/training-sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Success",
        description: "Training session deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete training session",
        variant: "destructive",
      });
    },
  });

  // Filter sessions based on search query
  const filteredSessions = sessions.filter(session =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.notes?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort sessions by date (most recent first)
  const sortedSessions = filteredSessions.sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleDeleteSession = (id: number) => {
    if (confirm("Are you sure you want to delete this training session?")) {
      deleteSessionMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar 
          title="Training Sessions" 
          subtitle="Manage and view all your training sessions"
          showNewSessionButton={true}
          onSearch={setSearchQuery}
          searchPlaceholder="Search sessions..."
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar 
        title="Training Sessions" 
        subtitle="Manage and view all your training sessions"
        showNewSessionButton={true}
        onSearch={setSearchQuery}
        searchPlaceholder="Search sessions..."
      />
      
      <main className="flex-1 overflow-y-auto p-6">
        {sortedSessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-24 h-24 basketball-orange rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-calendar-alt text-white text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Training Sessions</h3>
              <p className="text-gray-600 mb-6">
                {searchQuery ? "No sessions match your search criteria." : "Get started by creating your first training session."}
              </p>
              {!searchQuery && (
                <Button className="basketball-orange basketball-orange-hover text-white">
                  <i className="fas fa-plus mr-2"></i>
                  Create First Session
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-gray-900 mb-1">
                        {session.name}
                      </CardTitle>
                      <div className="flex items-center text-sm text-gray-500 space-x-4">
                        <span>
                          <i className="fas fa-calendar mr-1"></i>
                          {new Date(session.date).toLocaleDateString()}
                        </span>
                        <span>
                          <i className="fas fa-clock mr-1"></i>
                          {session.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteSession(session.id)}
                        disabled={deleteSessionMutation.isPending}
                      >
                        <i className="fas fa-trash"></i>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">{session.duration} minutes</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Attendance:</span>
                    <span className="font-medium">
                      {session.attendanceCount}/{session.totalPlayers} players
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Attendance Rate:</span>
                    <Badge variant={
                      ((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100 >= 80
                        ? "default"
                        : "secondary"
                    }>
                      {Math.round(((session.attendanceCount ?? 0) / (session.totalPlayers || 1)) * 100)}%
                    </Badge>
                  </div>
                  
                  {session.exerciseIds && session.exerciseIds.length > 0 && (
                    <div>
                      <span className="text-sm text-gray-600">Exercises:</span>
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs">
                          {session.exerciseIds.length} exercise{session.exerciseIds.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {session.notes && (
                    <div>
                      <span className="text-sm text-gray-600">Notes:</span>
                      <p className="text-sm text-gray-900 mt-1 line-clamp-2">{session.notes}</p>
                    </div>
                  )}
                  
                  <div className="pt-3 border-t border-gray-200">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      size="sm"
                    >
                      <i className="fas fa-eye mr-2"></i>
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
