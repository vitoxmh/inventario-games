"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
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
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"

type InventoryDict = Dictionary["inventory"]

export function GameDetailActions({
  gameId,
  title,
  dict,
  lang,
}: {
  gameId: string
  title: string
  dict: InventoryDict
  lang: Locale
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function remove() {
    startTransition(async () => {
      const res = await fetch(`/api/games/${gameId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(dict.errorUpdate)
        return
      }
      toast.success(dict.removedToast)
      setDeleteOpen(false)
      router.push(`/${lang}/app`)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDeleteOpen(true)}
        className="inline-flex items-center gap-1.5"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {dict.remove}
      </Button>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {dict.removeBody}
              {title ? ` (${title})` : ""}
            </AlertDialogDescription>
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
    </>
  )
}