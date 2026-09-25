"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Eye, MoreHorizontal, Trash2, Pen } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GameStatus } from "@/generated/prisma/enums"
import { STATUS_ICONS, type StatusKey } from "@/lib/status-meta"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"
import type { GameSummary } from "@/lib/game-summary"

type InventoryDict = Dictionary["inventory"]

export function GameCardActions({
  game,
  dict,
  lang,
}: {
  game: GameSummary
  dict: InventoryDict
  lang: Locale
}) {
  const router = useRouter()
  const status = game.status
  const [pending, startTransition] = useTransition()
  const [busyStatus, setBusyStatus] = useState<StatusKey | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const detailHref = `/${lang}/app/games/${game.id}`
  const editHref = `/${lang}/app/games/${game.id}/edit`

  function changeStatus(next: StatusKey) {
    setBusyStatus(next)
    startTransition(async () => {
      const res = await fetch(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      setBusyStatus(null)
      if (!res.ok) {
        toast.error(dict.errorAdd)
        return
      }
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await fetch(`/api/games/${game.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(dict.errorAdd)
        return
      }
      toast.success(dict.removedToast)
      setDeleteOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Ajustes"
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{dict.statusLabel}</DropdownMenuLabel>
            {(Object.keys(GameStatus) as StatusKey[]).map((key) => {
              const StatusIcon = STATUS_ICONS[key]
              return (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={key === status}
                  disabled={busyStatus === key}
                  closeOnClick
                  onCheckedChange={() => changeStatus(key)}
                >
                  <StatusIcon aria-hidden="true" />
                  {dict.statuses[key]}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(detailHref)}>
            <Eye aria-hidden="true" />
            {dict.viewDetails}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(editHref)}>
            <Pen aria-hidden="true" />
            {dict.edit}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            {dict.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.removeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.removeCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
              disabled={pending}
            >
              {dict.removeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}