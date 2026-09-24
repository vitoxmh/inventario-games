"use client"

import { useState, useTransition } from "react"
import { Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plan } from "@/generated/prisma/enums"
import type { Dictionary } from "@/messages/es"

type AdminDict = Dictionary["admin"]

type PlanKey = keyof typeof Plan

type PlanConfigRow = {
  plan: PlanKey
  imageLimit: number
}

export function AdminPlansClient({
  initialConfigs,
  dict,
}: {
  initialConfigs: PlanConfigRow[]
  dict: AdminDict
}) {
  const [edits, setEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConfigs.map((c) => [c.plan, String(c.imageLimit)])),
  )
  const [pending, startTransition] = useTransition()

  const labels: Record<PlanKey, string> = {
    FREE: dict.planFree,
    PRO: dict.planPro,
    COLLECTOR: dict.planCollector,
  }

  function save(plan: PlanKey) {
    const value = Number(edits[plan])
    if (!Number.isInteger(value) || value < 0 || value > 20) {
      toast.error(dict.saveError)
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, imageLimit: value }),
      })
      if (!res.ok) {
        toast.error(dict.saveError)
        return
      }
      toast.success(dict.saved)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.plans}</h2>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.plan}</TableHead>
              <TableHead>{dict.imageLimit}</TableHead>
              <TableHead className="text-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialConfigs.map((config) => (
              <TableRow key={config.plan}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{labels[config.plan]}</span>
                    <Badge variant="secondary">{config.plan}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={20}
                      value={edits[config.plan]}
                      onChange={(event) =>
                        setEdits((prev) => ({
                          ...prev,
                          [config.plan]: event.target.value.slice(0, 2),
                        }))
                      }
                      className="h-8 w-20"
                      aria-label={`${labels[config.plan]} ${dict.imageLimit}`}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      pending || String(config.imageLimit) === edits[config.plan]
                    }
                    onClick={() => save(config.plan)}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Save className="size-3.5" aria-hidden="true" />
                    {dict.save}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}