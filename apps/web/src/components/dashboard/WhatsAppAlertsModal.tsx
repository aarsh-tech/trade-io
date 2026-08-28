"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppAlertsManager } from "./WhatsAppAlertsManager";

interface WhatsAppAlertsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsAppAlertsModal({ open, onOpenChange }: WhatsAppAlertsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6 pt-11 sm:pt-6 rounded-2xl sm:rounded-3xl border-slate-200/90 shadow-2xl">
        <DialogTitle className="sr-only">WhatsApp Alerts Engine</DialogTitle>
        <WhatsAppAlertsManager />
      </DialogContent>
    </Dialog>
  );
}
