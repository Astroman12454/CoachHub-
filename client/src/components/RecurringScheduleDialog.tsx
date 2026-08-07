import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useDeleteWithUndo } from "@/hooks/use-delete-with-undo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import type { RecurringPracticeSlot } from "@shared/schema";

interface RecurringScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Monday-first, matching WeeklySchedule's DAYS_OF_WEEK — the value is the
// JS Date#getDay() number the server stores (0 = Sunday).
const DAY_OPTIONS = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 0, key: "sun" },
] as const;

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export default function RecurringScheduleDialog({ open, onOpenChange }: RecurringScheduleDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const restoreFocus = useDialogFocusReturn(open);

  const [name, setName] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [time, setTime] = useState("17:00");
  const [duration, setDuration] = useState("60");

  const [startDate, setStartDate] = useState(todayDateString);
  const [weeks, setWeeks] = useState("4");

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const { data: slots = [], isLoading } = useQuery<RecurringPracticeSlot[]>({
    queryKey: ["/api/recurring-slots"],
    enabled: open,
  });

  const createSlotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recurring-slots", {
        name: name.trim(),
        dayOfWeek: Number(dayOfWeek),
        time,
        duration: Number(duration),
      });
      return res.json() as Promise<RecurringPracticeSlot>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-slots"] });
      setName("");
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: extractErrorMessage(error) ?? t("recurringSchedule.addFailed"),
        variant: "destructive",
      });
    },
  });

  const { requestDelete, isPendingDelete } = useDeleteWithUndo({
    endpoint: "/api/recurring-slots",
    errorMessage: t("recurringSchedule.deleteFailed"),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recurring-slots/generate", {
        startDate,
        weeks: Number(weeks),
      });
      return res.json() as Promise<{ created: number }>;
    },
    onSuccess: ({ created }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({
        title: t("recurringSchedule.generatedToastTitle"),
        description: t("recurringSchedule.generatedToastDescription", { count: created }),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: extractErrorMessage(error) ?? t("recurringSchedule.generateFailed"),
        variant: "destructive",
      });
    },
  });

  const handleAddSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (createSlotMutation.isPending || !name.trim() || !time) return;
    createSlotMutation.mutate();
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (generateMutation.isPending || !startDate || !weeks) return;
    generateMutation.mutate();
  };

  const dayLabel = (day: number) => {
    const option = DAY_OPTIONS.find((d) => d.value === day);
    return option ? t(`schedule.days.${option.key}.full`) : "";
  };

  const visibleSlots = slots.filter((slot) => !isPendingDelete(slot.id));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("recurringSchedule.title")}</DialogTitle>
          <DialogDescription>{t("recurringSchedule.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? null : visibleSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recurringSchedule.noSlots")}</p>
          ) : (
            <ul className="space-y-2">
              {visibleSlots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{slot.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dayLabel(slot.dayOfWeek)} · {slot.time} · {t("schedule.durationMinNoSpace", { count: slot.duration })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    aria-label={t("recurringSchedule.deleteSlotAriaLabel", { name: slot.name })}
                    onClick={() =>
                      requestDelete(slot.id, t("recurringSchedule.deletedToast", { name: slot.name }))
                    }
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddSlot} className="space-y-3 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="recurring-slot-name">{t("recurringSchedule.slotName")}</Label>
              <Input
                id="recurring-slot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("recurringSchedule.slotNamePlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="recurring-slot-day">{t("recurringSchedule.day")}</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger id="recurring-slot-day" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {t(`schedule.days.${option.key}.full`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="recurring-slot-time">{t("recurringSchedule.time")}</Label>
                <Input
                  id="recurring-slot-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="recurring-slot-duration">{t("recurringSchedule.duration")}</Label>
                <Input
                  id="recurring-slot-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={createSlotMutation.isPending || !name.trim() || !time}
            >
              {createSlotMutation.isPending ? t("recurringSchedule.addingEllipsis") : t("recurringSchedule.add")}
            </Button>
          </form>

          <Separator />

          <form onSubmit={handleGenerate} className="space-y-3">
            <div>
              <h3 className="font-medium text-sm text-foreground">{t("recurringSchedule.generateSection")}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t("recurringSchedule.generateDescription")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="recurring-generate-start">{t("recurringSchedule.startDate")}</Label>
                <Input
                  id="recurring-generate-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="recurring-generate-weeks">{t("recurringSchedule.weeks")}</Label>
                <Input
                  id="recurring-generate-weeks"
                  type="number"
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full basketball-orange basketball-orange-hover text-white"
              disabled={generateMutation.isPending || !startDate || !weeks || visibleSlots.length === 0}
            >
              {generateMutation.isPending ? t("recurringSchedule.generatingEllipsis") : t("recurringSchedule.generate")}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
