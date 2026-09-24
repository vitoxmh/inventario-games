"use client"

import { useState, useTransition } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Dictionary } from "@/messages/es"

type AdminDict = Dictionary["admin"]

type AdminPlan = {
  slug: string
  nameEs: string
  nameEn: string
  gameLimit: number | null
  imageLimit: number
  paid: boolean
  active: boolean
  sortOrder: number
  userCount: number
}

type Draft = {
  nameEs: string
  nameEn: string
  gameLimit: string
  imageLimit: string
  active: boolean
}

function toDraft(plan: AdminPlan): Draft {
  return {
    nameEs: plan.nameEs,
    nameEn: plan.nameEn,
    gameLimit: plan.gameLimit === null ? "" : String(plan.gameLimit),
    imageLimit: String(plan.imageLimit),
    active: plan.active,
  }
}

export function AdminPlansClient({
  initialPlans,
  dict,
}: {
  initialPlans: AdminPlan[]
  dict: AdminDict
}) {
  const [plans, setPlans] = useState<AdminPlan[]>(initialPlans)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialPlans.map((plan) => [plan.slug, toDraft(plan)])),
  )
  const [newPlan, setNewPlan] = useState<Draft>({
    nameEs: "",
    nameEn: "",
    gameLimit: "",
    imageLimit: "1",
    active: true,
  })
  const [pending, startTransition] = useTransition()

  function setDraft(slug: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [slug]: { ...(prev[slug] ?? toDraft(plans.find((p) => p.slug === slug)!)), ...patch },
    }))
  }

  function save(slug: string) {
    const draft = drafts[slug]
    startTransition(async () => {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          nameEs: draft.nameEs,
          nameEn: draft.nameEn,
          gameLimit: draft.gameLimit === "" ? null : Number(draft.gameLimit),
          imageLimit: Number(draft.imageLimit),
          active: draft.active,
        }),
      })
      if (!res.ok) {
        toast.error(dict.saveError)
        return
      }
      const data = (await res.json()) as { plan: AdminPlan }
      setPlans((prev) =>
        prev.map((p) => (p.slug === slug ? { ...p, ...data.plan } : p)),
      )
      toast.success(dict.saved)
    })
  }

  function remove(slug: string) {
    startTransition(async () => {
      const res = await fetch("/api/admin/plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      })
      if (res.status === 409) {
        toast.error(dict.platformInUse)
        return
      }
      if (!res.ok) {
        toast.error(dict.saveError)
        return
      }
      setPlans((prev) => prev.filter((p) => p.slug !== slug))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[slug]
        return next
      })
      toast.success(dict.saved)
    })
  }

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!newPlan.nameEs.trim()) return
    startTransition(async () => {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newPlan.nameEs,
          nameEs: newPlan.nameEs,
          nameEn: newPlan.nameEn,
          gameLimit: newPlan.gameLimit === "" ? null : Number(newPlan.gameLimit),
          imageLimit: Number(newPlan.imageLimit) || 1,
          active: newPlan.active,
        }),
      })
      if (!res.ok) {
        toast.error(dict.saveError)
        return
      }
      const data = (await res.json()) as { plan: AdminPlan }
      setPlans((prev) =>
        prev.concat({ ...data.plan, userCount: 0 }).sort((a, b) => a.slug.localeCompare(b.slug)),
      )
      setDrafts((prev) => ({ ...prev, [data.plan.slug]: toDraft(data.plan) }))
      setNewPlan({ nameEs: "", nameEn: "", gameLimit: "", imageLimit: "1", active: true })
      toast.success(dict.saved)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.plans}</h2>

      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="plan-name-es" className="text-xs font-medium text-muted-foreground">
            {dict.planNameEs}
          </label>
          <Input
            id="plan-name-es"
            value={newPlan.nameEs}
            onChange={(event) =>
              setNewPlan((prev) => ({ ...prev, nameEs: event.target.value }))
            }
            maxLength={60}
            className="h-8 w-40"
            autoComplete="off"
            placeholder="Ej: Gratis"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="plan-name-en" className="text-xs font-medium text-muted-foreground">
            {dict.planNameEn}
          </label>
          <Input
            id="plan-name-en"
            value={newPlan.nameEn}
            onChange={(event) =>
              setNewPlan((prev) => ({ ...prev, nameEn: event.target.value }))
            }
            maxLength={60}
            className="h-8 w-40"
            autoComplete="off"
            placeholder="Ej: Free"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="plan-new-games" className="text-xs font-medium text-muted-foreground">
            {dict.gameLimit}
          </label>
          <Input
            id="plan-new-games"
            type="number"
            inputMode="numeric"
            min={0}
            value={newPlan.gameLimit}
            onChange={(event) =>
              setNewPlan((prev) => ({ ...prev, gameLimit: event.target.value }))
            }
            className="h-8 w-24"
            placeholder={dict.unlimited}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="plan-new-images" className="text-xs font-medium text-muted-foreground">
            {dict.imageLimit}
          </label>
          <Input
            id="plan-new-images"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={newPlan.imageLimit}
            onChange={(event) =>
              setNewPlan((prev) => ({ ...prev, imageLimit: event.target.value }))
            }
            className="h-8 w-20"
          />
        </div>
        <Button
          type="submit"
          disabled={pending || newPlan.nameEs.trim().length === 0}
          className="inline-flex items-center gap-1.5"
        >
          <Plus className="size-4" aria-hidden="true" />
          {dict.addPlan}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.name}</TableHead>
              <TableHead>{dict.slug}</TableHead>
              <TableHead>{dict.gameLimit}</TableHead>
              <TableHead>{dict.imageLimit}</TableHead>
              <TableHead>{dict.plan}</TableHead>
              <TableHead className="text-center">{dict.gamesCount}*</TableHead>
              <TableHead className="text-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {dict.noGames}
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => {
                const draft = drafts[plan.slug]
                const dirty =
                  draft &&
                  (draft.nameEs !== plan.nameEs ||
                    draft.nameEn !== plan.nameEn ||
                    draft.gameLimit !== (plan.gameLimit === null ? "" : String(plan.gameLimit)) ||
                    draft.imageLimit !== String(plan.imageLimit) ||
                    draft.active !== plan.active)
                return (
                  <TableRow key={plan.slug}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          value={draft.nameEs}
                          onChange={(event) =>
                            setDraft(plan.slug, { nameEs: event.target.value })
                          }
                          maxLength={60}
                          className="h-7 w-40"
                          autoComplete="off"
                          aria-label={dict.planNameEs}
                        />
                        <Input
                          value={draft.nameEn}
                          onChange={(event) =>
                            setDraft(plan.slug, { nameEn: event.target.value })
                          }
                          maxLength={60}
                          className="h-7 w-40"
                          autoComplete="off"
                          aria-label={dict.planNameEn}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="secondary">{plan.slug}</Badge>
                        {plan.paid && <Badge variant="outline">paid</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={draft.gameLimit}
                        onChange={(event) =>
                          setDraft(plan.slug, { gameLimit: event.target.value })
                        }
                        className="h-7 w-24"
                        placeholder={dict.unlimited}
                        aria-label={dict.gameLimit}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={20}
                        value={draft.imageLimit}
                        onChange={(event) =>
                          setDraft(plan.slug, { imageLimit: event.target.value })
                        }
                        className="h-7 w-20"
                        aria-label={dict.imageLimit}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={draft.active}
                          onCheckedChange={(checked) =>
                            setDraft(plan.slug, { active: checked ?? false })
                          }
                          aria-label={dict.plan}
                        />
                        <span className="text-sm text-muted-foreground">
                          {draft.active ? dict.active : dict.inactive}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {plan.userCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || !dirty}
                          onClick={() => save(plan.slug)}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Save className="size-3.5" aria-hidden="true" />
                          {dict.save}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <Trash2 className="text-destructive" aria-hidden="true" />
                            <span className="sr-only">{dict.deletePlan}</span>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{dict.confirmDeletePlan}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {dict.confirmDeletePlanBody}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{dict.banCancel}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={(event) => {
                                  event.preventDefault()
                                  remove(plan.slug)
                                }}
                                disabled={pending}
                              >
                                {dict.removeConfirm}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        *{dict.deletePlanBodyHint}
      </p>
    </div>
  )
}