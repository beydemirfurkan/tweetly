'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogKicker,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'destructive' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kicker?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: Tone;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  kicker,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'destructive',
  onConfirm,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {kicker ? <DialogKicker>{kicker}</DialogKicker> : null}
          <DialogTitle className="flex items-start gap-2.5">
            {tone === 'destructive' ? (
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            ) : null}
            <span>{title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground whitespace-pre-line">
          {description}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={working}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={working}
            className={cn(
              tone === 'destructive' &&
                'bg-destructive text-white hover:bg-destructive/90',
            )}
          >
            {working ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
