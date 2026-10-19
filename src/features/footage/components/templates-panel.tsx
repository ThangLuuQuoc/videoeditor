"use client"

import { CheckIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"

import { templates, type TemplateId } from "../lib/templates"
import { PanelHeading } from "./editor-panels"

/**
 * Templates (§7.16): a finished style in one click, or an "AI first cut"
 * that writes text and picks graphics in that style. Both are one undo step.
 */
export function TemplatesPanel({
  activeTemplate,
  hasMoments,
  isDirecting,
  onApply,
  onFirstCut,
}: {
  activeTemplate: string | null
  hasMoments: boolean
  isDirecting: boolean
  onApply: (id: TemplateId) => void
  onFirstCut: (id: TemplateId) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <PanelHeading
        title="Templates"
        description={
          hasMoments
            ? "Pick a style for the whole clip: camera, cuts, text, lens and an end card. Everything stays editable."
            : "Add a key moment first: templates move the camera between them."
        }
      />
      <ul className="flex flex-col gap-3" aria-label="Templates">
        {templates.map((template) => {
          const active = activeTemplate === template.id
          const headingId = `template-${template.id}`
          return (
            <li
              key={template.id}
              aria-labelledby={headingId}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3"
              data-active={active || undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h3 id={headingId} className="text-sm font-medium">
                    {template.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {template.hint}
                  </p>
                </div>
                <span className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {template.shape}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  disabled={!hasMoments || isDirecting}
                  aria-label={`Apply ${template.title}`}
                  onClick={() => onApply(template.id)}
                >
                  {active && <CheckIcon data-icon="inline-start" />}
                  {active ? "Applied" : "Apply"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasMoments || isDirecting}
                  aria-label={`AI first cut: ${template.title}`}
                  onClick={() => onFirstCut(template.id)}
                >
                  {isDirecting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SparklesIcon data-icon="inline-start" />
                  )}
                  AI first cut
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
