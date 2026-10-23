"use client"

import { useState, useTransition } from "react"
import { Ban, ChevronLeft, ChevronRight, Search, ShieldCheck, ShieldOff, Trash2, UserCheck } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Dictionary } from "@/messages/es"

type AdminDict = Dictionary["admin"]

type AdminUser = {
  id: string
  email: string
  name: string | null
  plan: string
  role: string
  bannedAt: string | null
  emailVerifiedAt: string | null
  subscriptionStatus: string | null
  createdAt: string
  gameCount: number
}

type ListResponse = {
  users: AdminUser[]
  total: number
  pages: number
}

type PlanOption = {
  slug: string
  label: string
  active: boolean
}

export function AdminUsersClient({
  initialUsers,
  initialTotal,
  plans,
  currentUserId,
  dict,
}: {
  initialUsers: AdminUser[]
  initialTotal: number
  plans: PlanOption[]
  currentUserId: string
  dict: AdminDict
}) {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [state, setState] = useState<ListResponse>({
    users: initialUsers,
    total: initialTotal,
    pages: 1,
  })
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)

  function load(nextPage: number, query: string) {
    startTransition(async () => {
      const params = new URLSearchParams({ page: String(nextPage) })
      if (query.trim()) params.set("q", query.trim())
      const res = await fetch(`/api/admin/users?${params.toString()}`)
      if (!res.ok) {
        toast.error(dict.noUsers)
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

  function patch(id: string, body: Record<string, unknown>) {
    return fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  async function changePlan(user: AdminUser, plan: string) {
    const res = await patch(user.id, { plan })
    if (!res.ok) {
      toast.error(dict.noUsers)
      return
    }
    const data = (await res.json()) as { user: AdminUser }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === user.id ? data.user : u)),
    }))
    toast.success(dict.saved)
  }

  function toggleRole(user: AdminUser) {
    const role = user.role === "admin" ? "user" : "admin"
    void patch(user.id, { role }).then(async (res) => {
      if (!res.ok) {
        toast.error(dict.noUsers)
        return
      }
      const data = (await res.json()) as { user: AdminUser }
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === user.id ? data.user : u)),
      }))
      toast.success(dict.saved)
    })
  }

  function toggleBan(user: AdminUser) {
    const ban = user.bannedAt == null
    void patch(user.id, { ban }).then(async (res) => {
      if (!res.ok) {
        toast.error(dict.noUsers)
        return
      }
      const data = (await res.json()) as { user: AdminUser }
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === user.id ? data.user : u)),
      }))
      toast.success(dict.saved)
    })
  }

  function remove(user: AdminUser) {
    setDeleting(user.id)
    void fetch(`/api/admin/users/${user.id}`, { method: "DELETE" }).then(
      async (res) => {
        setDeleting(null)
        if (!res.ok) {
          toast.error(dict.saveError)
          return
        }
        toast.success(dict.saved)
        setState((prev) => ({
          ...prev,
          users: prev.users.filter((u) => u.id !== user.id),
          total: Math.max(0, prev.total - 1),
        }))
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{dict.users}</h2>
        <form onSubmit={search} className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 u-muted"
            aria-hidden="true"
          />
<Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={dict.searchUsers}
              maxLength={100}
              className="w-64 pl-9"
              autoComplete="off"
            />
        </form>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.email}</TableHead>
              <TableHead>{dict.plan}</TableHead>
              <TableHead>{dict.role}</TableHead>
              <TableHead className="u-center">{dict.gamesCount}</TableHead>
              <TableHead>{dict.status}</TableHead>
              <TableHead className="u-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 u-center u-muted">
                  {dict.noUsers}
                </TableCell>
              </TableRow>
            ) : (
              state.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.email}</span>
                      <span className="text-xs u-muted">
                        {user.name ?? "—"}
                        {user.emailVerifiedAt ? "" : ` · ${dict.unverified}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.plan}
                      onValueChange={(value) =>
                        value != null && changePlan(user, value)
                      }
                      itemToStringLabel={(value) =>
                        plans.find((p) => p.slug === value)?.label ?? value
                      }
                    >
                      <SelectTrigger size="sm" aria-label={dict.plan}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem
                            key={plan.slug}
                            value={plan.slug}
                            disabled={!plan.active && plan.slug !== user.plan}
                          >
                            {plan.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "primary" : "secondary"}>
                      {user.role === "admin" ? dict.roleAdmin : dict.roleUser}
                    </Badge>
                  </TableCell>
                  <TableCell className="u-center u-numeric">
                    {user.gameCount}
                  </TableCell>
                  <TableCell>
                    {user.bannedAt ? (
                      <Badge variant="danger">{dict.banned}</Badge>
                    ) : (
                      <Badge variant="outline">{dict.active}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="u-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleRole(user)}
                      >
                        {user.role === "admin" ? (
                          <ShieldOff aria-hidden="true" />
                        ) : (
                          <ShieldCheck aria-hidden="true" />
                        )}
                        {user.role === "admin"
                          ? dict.removeAdmin
                          : dict.makeAdmin}
                      </Button>
                      <Button
                        type="button"
                        variant={user.bannedAt ? "secondary" : "danger"}
                        size="sm"
                        onClick={() => toggleBan(user)}
                      >
                        {user.bannedAt ? (
                          <UserCheck aria-hidden="true" />
                        ) : (
                          <Ban aria-hidden="true" />
                        )}
                        {user.bannedAt ? dict.unban : dict.ban}
                      </Button>
                      {user.id !== currentUserId && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <Trash2 className="u-danger" aria-hidden="true" />
                            <span className="sr-only">{dict.removeUser}</span>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {dict.removeUserTitle}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {dict.removeUserBody}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {dict.banCancel}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={(event) => {
                                  event.preventDefault()
                                  remove(user)
                                }}
                                disabled={deleting === user.id}
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

      {state.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm u-muted">
            {dict.totalUsers}: {state.total}
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
            <span className="text-sm u-muted u-numeric">
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