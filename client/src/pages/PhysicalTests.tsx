import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Activity, Pencil, Trash2, ClipboardList, ArrowDown, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import TopBar from "@/components/TopBar";
import PhysicalTestForm from "@/components/PhysicalTestForm";
import RecordTestResultsDialog from "@/components/RecordTestResultsDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import type { PhysicalTest } from "@shared/schema";

export default function PhysicalTests() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<PhysicalTest | null>(null);
  const [testToDelete, setTestToDelete] = useState<PhysicalTest | null>(null);
  const [recordingTest, setRecordingTest] = useState<PhysicalTest | null>(null);

  const { data: tests = [], isLoading, isError, refetch } = useQuery<PhysicalTest[]>({
    queryKey: ["/api/physical-tests"],
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/physical-tests",
    errorMessage: t("physicalTests.failedToDelete"),
  });

  const confirmDeleteTest = () => {
    if (testToDelete) {
      requestDelete(testToDelete.id, t("physicalTests.deletedToast", { name: testToDelete.name }));
      setTestToDelete(null);
    }
  };

  const filteredTests = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return tests.filter((test) => !isPendingDelete(test.id) && test.name.toLowerCase().includes(query));
  }, [tests, searchQuery, isPendingDelete]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title={t("nav.physicalTests")} subtitle={t("physicalTests.subtitle")} onSearch={setSearchQuery} searchPlaceholder={t("physicalTests.searchPlaceholder")} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title={t("nav.physicalTests")} subtitle={t("physicalTests.subtitle")} onSearch={setSearchQuery} searchPlaceholder={t("physicalTests.searchPlaceholder")} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorState onRetry={() => refetch()} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title={t("nav.physicalTests")} subtitle={t("physicalTests.subtitle")} onSearch={setSearchQuery} searchPlaceholder={t("physicalTests.searchPlaceholder")} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex justify-end mb-6">
          <Button
            className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            onClick={() => setIsCreateFormOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
            {t("physicalTests.addTest")}
          </Button>
        </div>

        {filteredTests.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={t("physicalTests.emptyTitle")}
            description={searchQuery ? t("physicalTests.emptyFilterDescription") : t("physicalTests.emptyDescription")}
            action={!searchQuery ? {
              label: t("physicalTests.addFirstTest"),
              icon: Plus,
              onClick: () => setIsCreateFormOpen(true),
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTests.map((test, index) => (
              <Card key={test.id} className="fade-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span className="truncate">{test.name}</span>
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      {test.lowerIsBetter === 1
                        ? <ArrowDown className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                        : <ArrowUp className="w-3 h-3" strokeWidth={2} aria-hidden="true" />}
                      {test.unit}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {test.description && <p className="text-sm text-muted-foreground mb-4">{test.description}</p>}
                  <div className="flex items-center justify-between gap-1.5">
                    <Button
                      size="sm"
                      className="basketball-orange basketball-orange-hover text-white flex-1"
                      onClick={() => setRecordingTest(test)}
                    >
                      <ClipboardList className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("physicalTests.recordResults")}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-8 h-8 shrink-0"
                      onClick={() => setEditingTest(test)}
                      aria-label={t("physicalTests.editTestFor", { name: test.name })}
                      title={t("common.edit")}
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-8 h-8 shrink-0"
                      onClick={() => setTestToDelete(test)}
                      aria-label={t("physicalTests.deleteTestFor", { name: test.name })}
                      title={t("common.delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {isCreateFormOpen && (
        <PhysicalTestForm isOpen={isCreateFormOpen} onClose={() => setIsCreateFormOpen(false)} />
      )}

      {editingTest && (
        <PhysicalTestForm isOpen={!!editingTest} onClose={() => setEditingTest(null)} test={editingTest} />
      )}

      <RecordTestResultsDialog test={recordingTest} onOpenChange={(open) => !open && setRecordingTest(null)} />

      <ConfirmDialog
        open={!!testToDelete}
        onOpenChange={(open) => !open && setTestToDelete(null)}
        title={t("physicalTests.deleteConfirmTitle")}
        description={t("physicalTests.deleteConfirmDescription", { name: testToDelete?.name })}
        onConfirm={confirmDeleteTest}
      />
    </div>
  );
}
