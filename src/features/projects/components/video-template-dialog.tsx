"use client"

import { LayoutTemplateIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"

import { templates, type TemplateId } from "@/features/footage/client"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Switch } from "@/shared/ui/switch"

/**
 * A template for every clip of the video at once (§7.16), optionally with
 * the AI writing each clip's text: one change, undone with "Undo template".
 */
export function VideoTemplateDialog({
  current,
  busy,
  onApply,
  onUndo,
}: {
  /** The video's last template, while it can be undone. */
  current: { templateId: string; withAi: boolean } | null
  busy: boolean
  /** Resolves true when applied (the dialog closes). */
  onApply: (templateId: TemplateId, withAi: boolean) => Promise<boolean>
  onUndo: () => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<TemplateId>("launch")
  const [withAi, setWithAi] = useState(false)
  const currentTitle = templates.find(
    (t) => t.id === current?.templateId
  )?.title

  return (
    <>
      {current && currentTitle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onUndo}
          title={`Put every clip back as it was before ${currentTitle}`}
        >
          Undo template
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LayoutTemplateIcon data-icon="inline-start" />
        )}
        <span className="hidden sm:inline">{currentTitle ?? "Template"}</span>
        <span className="sr-only sm:hidden">Template</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Template for every clip</DialogTitle>
            <DialogDescription>
              Sets the camera, cuts, text style, lens, end card and the
              transitions between clips. Clips without key moments stay as they
              are.
            </DialogDescription>
          </DialogHeader>
          <div
            role="radiogroup"
            aria-label="Template"
            className="grid gap-2 sm:grid-cols-2"
          >
            {templates.map((template) => {
              const checked = picked === template.id
              return (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setPicked(template.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    checked ? "border-primary bg-primary/5" : "hover:bg-muted"
                  )}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {template.title}
                    <span className="font-mono text-xs text-muted-foreground">
                      {template.shape}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {template.hint}
                  </span>
                </button>
              )
            })}
          </div>
          <Field orientation="horizontal">
            <Switch
              id="template-with-ai"
              aria-describedby="template-with-ai-hint"
              checked={withAi}
              onCheckedChange={setWithAi}
            />
            <FieldContent>
              <FieldLabel htmlFor="template-with-ai">
                Write the text with AI
              </FieldLabel>
              <FieldDescription id="template-with-ai-hint">
                Headlines, labels and graphics for each clip’s key moments, in
                this style. Uses one AI direction per clip.
              </FieldDescription>
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onApply(picked, withAi)) setOpen(false)
              }}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : withAi ? (
                <SparklesIcon data-icon="inline-start" />
              ) : (
                <LayoutTemplateIcon data-icon="inline-start" />
              )}
              {busy
                ? "Applying…"
                : withAi
                  ? "AI first cut"
                  : "Apply to every clip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
