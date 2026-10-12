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

type AdminGenre = {
  id: string
  slug: string
  nameEs: string
  nameEn: string
  gameCount: number
}

type Draft = { nameEs: string; nameEn: string }

const EMPTY_DRAFT: Draft = { nameEs: "", nameEn: "" }

/**
 * Gestión del listado de géneros.
 *
 * A diferencia de las plataformas, cada fila tiene dos nombres, porque el género
 * se muestra junto al resto de la ficha y la interfaz está en español e inglés.
 * El `slug` no se edita: es la clave estable de la que dependen el matcher de
 * sinónimos y el backfill de las migraciones.
 */
export function AdminGenresClient({
  initialGenres,
  dict,
}: {
  initialGenres: AdminGenre[]
  dict: AdminDict
}) {
  const [genres, setGenres] = useState<AdminGenre[]>(initialGenres)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Draft>(EMPTY_DRAFT)
  const [adding, startAdd] = useTransition()
  const [mutating, startMutation] = useTransition()

  function add(event: React.FormEvent) {
    event.preventDefault()
    const nameEs = draft.nameEs.trim()
    const nameEn = draft.nameEn.trim()
    if (!nameEs || !nameEn) return
    startAdd(async () => {
      const res = await fetch("/api/admin/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameEs, nameEn }),
      })
      if (!res.ok) {
        toast.error(dict.saved)
        return
      }
      const data = (await res.json()) as { genre: AdminGenre }
      setGenres((prev) =>
        prev.concat({
          id: data.genre.id,
          slug: data.genre.slug,
          nameEs: data.genre.nameEs,
          nameEn: data.genre.nameEn,
          gameCount: 0,
        }),
      )
      setDraft(EMPTY_DRAFT)
      toast.success(dict.saved)
    })
  }

  function startRename(genre: AdminGenre) {
    setEditingId(genre.id)
    setEditing({ nameEs: genre.nameEs, nameEn: genre.nameEn })
  }

  function cancelRename() {
    setEditingId(null)
    setEditing(EMPTY_DRAFT)
  }

  function saveRename(id: string) {
    const nameEs = editing.nameEs.trim()
    const nameEn = editing.nameEn.trim()
    if (!nameEs || !nameEn) return
    startMutation(async () => {
      const res = await fetch(`/api/admin/genres/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameEs, nameEn }),
      })
      if (!res.ok) {
        toast.error(dict.saved)
        return
      }
      const data = (await res.json()) as { genre: { nameEs: string; nameEn: string } }
      setGenres((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, nameEs: data.genre.nameEs, nameEn: data.genre.nameEn } : g,
        ),
      )
      setEditingId(null)
      setEditing(EMPTY_DRAFT)
      toast.success(dict.saved)
    })
  }

  function remove(id: string) {
    startMutation(async () => {
      const res = await fetch(`/api/admin/genres/${id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(dict.saved)
        return
      }
      const data = (await res.json()) as { detached: number }
      setGenres((prev) => prev.filter((g) => g.id !== id))
      toast.success(dict.saved)
      // Borrar un género en uso no se bloquea: los juegos quedan sin él. Avisar
      // evita que el admin piense que solo se ha borrado una fila de la tabla.
      if (data.detached > 0) {
        toast.warning(dict.genreDetached)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.genres}</h2>

      <form
        onSubmit={add}
        className="flex w-full max-w-xl flex-wrap items-center gap-2"
      >
        <Input
          value={draft.nameEs}
          onChange={(event) => setDraft((p) => ({ ...p, nameEs: event.target.value }))}
          placeholder={dict.genreNameEs}
          aria-label={dict.genreNameEs}
          maxLength={100}
          autoComplete="off"
        />
        <Input
          value={draft.nameEn}
          onChange={(event) => setDraft((p) => ({ ...p, nameEn: event.target.value }))}
          placeholder={dict.genreNameEn}
          aria-label={dict.genreNameEn}
          maxLength={100}
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={adding || !draft.nameEs.trim() || !draft.nameEn.trim()}
        >
          <Plus aria-hidden="true" />
          {dict.add}
        </Button>
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.genreNameEs}</TableHead>
              <TableHead>{dict.genreNameEn}</TableHead>
              <TableHead>{dict.slug}</TableHead>
              <TableHead>{dict.gamesCount}</TableHead>
              <TableHead className="u-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {genres.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 u-center u-muted">
                  {dict.noGames}
                </TableCell>
              </TableRow>
            ) : (
              genres.map((genre) => {
                const isEditing = editingId === genre.id
                return (
                  <TableRow key={genre.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editing.nameEs}
                          onChange={(event) =>
                            setEditing((p) => ({ ...p, nameEs: event.target.value }))
                          }
                          maxLength={100}
                          className="h-8 w-40"
                          autoComplete="off"
                        />
                      ) : (
                        <span className="font-medium">{genre.nameEs}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editing.nameEn}
                          onChange={(event) =>
                            setEditing((p) => ({ ...p, nameEn: event.target.value }))
                          }
                          maxLength={100}
                          className="h-8 w-40"
                          autoComplete="off"
                        />
                      ) : (
                        <span className="font-medium">{genre.nameEn}</span>
                      )}
                    </TableCell>
                    <TableCell className="u-muted">
                      <Badge variant="secondary">{genre.slug}</Badge>
                    </TableCell>
                    <TableCell className="u-muted u-numeric">{genre.gameCount}</TableCell>
                    <TableCell className="u-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isEditing ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                mutating ||
                                !editing.nameEs.trim() ||
                                !editing.nameEn.trim()
                              }
                              onClick={() => saveRename(genre.id)}
                            >
                              {dict.save}
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={cancelRename}
                              className="u-muted"
                            >
                              <X aria-hidden="true" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => startRename(genre)}
                              className="u-muted"
                            >
                              <Pencil aria-hidden="true" />
                              <span className="sr-only">{dict.renamePlatform}</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={<Button variant="ghost" size="icon-sm" />}
                              >
                                <Trash2 className="u-danger" aria-hidden="true" />
                                <span className="sr-only">{dict.removeGame}</span>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {dict.removeGameTitle}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {genre.gameCount > 0
                                      ? dict.removeGenreInUseBody
                                      : dict.removeGameBody}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{dict.banCancel}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={(event) => {
                                      event.preventDefault()
                                      remove(genre.id)
                                    }}
                                    disabled={mutating}
                                  >
                                    {dict.removeConfirm}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
