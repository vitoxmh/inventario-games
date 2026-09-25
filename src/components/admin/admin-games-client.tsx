"use client"

import { useState, useTransition } from "react"
import { ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react"
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

type AdminGame = {
  id: string
  title: string
  platform: string
  genre: string | null
  status: string
  createdAt: string
  ownerEmail: string
}

type ListResponse = {
  games: AdminGame[]
  total: number
  pages: number
}

export function AdminGamesClient({
  initialGames,
  initialTotal,
  dict,
  statuses,
}: {
  initialGames: AdminGame[]
  initialTotal: number
  dict: AdminDict
  statuses: Record<string, string>
}) {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [state, setState] = useState<ListResponse>({
    games: initialGames,
    total: initialTotal,
    pages: 1,
  })
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)

  function load(nextPage: number, query: string) {
    startTransition(async () => {
      const params = new URLSearchParams({ page: String(nextPage) })
      if (query.trim()) params.set("q", query.trim())
      const res = await fetch(`/api/admin/games?${params.toString()}`)
      if (!res.ok) {
        toast.error(dict.noGames)
        return
      }
      const data = (await res.json()) as ListResponse
      setState(data)
      setPage(nextPage)
    })
  }

  function search(event: React.FormEvent) {
    event.preventDefault()
    load(1, q)
  }

  function remove(game: AdminGame) {
    setDeleting(true)
    void fetch(`/api/admin/games/${game.id}`, { method: "DELETE" }).then(
      async (res) => {
        setDeleting(false)
        if (!res.ok) {
          toast.error(dict.noGames)
          return
        }
        toast.success(dict.saved)
        setState((prev) => ({
          ...prev,
          games: prev.games.filter((g) => g.id !== game.id),
        }))
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.games}</h2>

      <form
        onSubmit={search}
        className="relative w-full sm:w-80"
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={dict.searchGames}
          maxLength={100}
          className="pl-9"
          autoComplete="off"
        />
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.game}</TableHead>
              <TableHead>{dict.owner}</TableHead>
              <TableHead>{dict.status}</TableHead>
              <TableHead className="text-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.games.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {dict.noGames}
                </TableCell>
              </TableRow>
            ) : (
              state.games.map((game) => (
                <TableRow key={game.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{game.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {game.platform}
                        {game.genre ? ` · ${game.genre}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {game.ownerEmail}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {statuses[game.status] ?? game.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" />
                        }
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
                              remove(game)
                            }}
                            disabled={deleting}
                          >
                            {dict.removeConfirm}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {state.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {dict.totalGames}: {state.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || page <= 1}
              onClick={() => load(page - 1, q)}
            >
              <ChevronLeft aria-hidden="true" />
              {dict.prev}
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {state.pages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || page >= state.pages}
              onClick={() => load(page + 1, q)}
            >
              {dict.next}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}