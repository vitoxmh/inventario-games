"use client"

import { useState, useTransition } from "react"
import { Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

type AdminPlatform = {
  id: string
  name: string
  slug: string
  gameCount: number
}

export function AdminPlatformsClient({
  initialPlatforms,
  dict,
}: {
  initialPlatforms: AdminPlatform[]
  dict: AdminDict
}) {
  const [platforms, setPlatforms] = useState<AdminPlatform[]>(initialPlatforms)
  const [name, setName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [adding, startAdd] = useTransition()
  const [mutating, startMutation] = useTransition()

  function add(event: React.FormEvent) {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    startAdd(async () => {
      const res = await fetch("/api/admin/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      })
      if (!res.ok) {
        toast.error(dict.noUsers)
        return
      }
      const data = (await res.json()) as {
        platform: {
          id: string
          name: string
          slug: string
          _count: { games: number }
        }
      }
      setPlatforms((prev) =>
        prev
          .concat({
            id: data.platform.id,
            name: data.platform.name,
            slug: data.platform.slug,
            gameCount: data.platform._count.games,
          })
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      )
      setName("")
      toast.success(dict.saved)
    })
  }

  function startRename(platform: AdminPlatform) {
    setEditingId(platform.id)
    setEditingName(platform.name)
  }

  function cancelRename() {
    setEditingId(null)
    setEditingName("")
  }

  function saveRename(id: string) {
    const value = editingName.trim()
    if (!value) return
    startMutation(async () => {
      const res = await fetch(`/api/admin/platforms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      })
      if (!res.ok) {
        toast.error(dict.noUsers)
        return
      }
      const data = (await res.json()) as { platform: { name: string; slug: string } }
      setPlatforms((prev) =>
        prev
          .map((p) =>
            p.id === id
              ? { ...p, name: data.platform.name, slug: data.platform.slug }
              : p,
          )
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      )
      setEditingId(null)
      setEditingName("")
      toast.success(dict.saved)
    })
  }

  function remove(id: string) {
    startMutation(async () => {
      const res = await fetch(`/api/admin/platforms/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast.error(dict.noUsers)
        return
      }
      setPlatforms((prev) => prev.filter((p) => p.id !== id))
      toast.success(dict.saved)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.platforms}</h2>

      <form onSubmit={add} className="flex w-full max-w-sm gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={dict.addPlatform}
          maxLength={100}
          autoComplete="off"
        />
        <Button type="submit" disabled={adding || name.trim().length === 0}>
          <Plus aria-hidden="true" />
          {dict.add}
        </Button>
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.name}</TableHead>
              <TableHead>{dict.slug}</TableHead>
              <TableHead>{dict.gamesCount}</TableHead>
              <TableHead className="text-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {platforms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {dict.noGames}
                </TableCell>
              </TableRow>
            ) : (
              platforms.map((platform) => (
                <TableRow key={platform.id}>
                  <TableCell>
                    {editingId === platform.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={100}
                          className="h-8 w-48"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutating || editingName.trim().length === 0}
                          onClick={() => saveRename(platform.id)}
                        >
                          {dict.save}
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={cancelRename}
                          className="text-muted-foreground"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    ) : (
                      <span className="font-medium">{platform.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Badge variant="secondary">{platform.slug}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {platform.gameCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startRename(platform)}
                        className="text-muted-foreground"
                      >
                        <Pencil aria-hidden="true" />
                        <span className="sr-only">{dict.renamePlatform}</span>
                      </Button>
                      {platform.gameCount > 0 ? (
                        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Trash2 className="opacity-40" aria-hidden="true" />
                          <span>{dict.platformInUse}</span>
                        </div>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <Trash2 className="text-destructive" aria-hidden="true" />
                            <span className="sr-only">{dict.removeGame}</span>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {dict.removeGameTitle}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {dict.removeGameBody}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{dict.banCancel}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={(event) => {
                                  event.preventDefault()
                                  remove(platform.id)
                                }}
                                disabled={mutating}
                              >
                                {dict.removeConfirm}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}