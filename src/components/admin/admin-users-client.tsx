"use client"

import { useState, useTransition } from "react"
import { Search } from "lucide-react"
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

export function AdminUsersClient({
  initialUsers,
  initialTotal,
  dict,
}: {
  initialUsers: AdminUser[]
  initialTotal: number
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{dict.users}</h2>
        <form onSubmit={search} className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
              <TableHead className="text-center">{dict.gamesCount}</TableHead>
              <TableHead>{dict.status}</TableHead>
              <TableHead className="text-right">{dict.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {dict.noUsers}
                </TableCell>
              </TableRow>
            ) : (
              state.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.email}</span>
                      <span className="text-xs text-muted-foreground">
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
                    >
                      <SelectTrigger size="sm" aria-label={dict.plan}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FREE">Free</SelectItem>
                        <SelectItem value="PRO">Pro</SelectItem>
                        <SelectItem value="COLLECTOR">Collector</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? dict.roleAdmin : dict.roleUser}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {user.gameCount}
                  </TableCell>
                  <TableCell>
                    {user.bannedAt ? (
                      <Badge variant="destructive">{dict.banned}</Badge>
                    ) : (
                      <Badge variant="outline">{dict.active}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleRole(user)}
                      >
                        {user.role === "admin"
                          ? dict.removeAdmin
                          : dict.makeAdmin}
                      </Button>
                      <Button
                        type="button"
                        variant={user.bannedAt ? "secondary" : "destructive"}
                        size="sm"
                        onClick={() => toggleBan(user)}
                      >
                        {user.bannedAt ? dict.unban : dict.ban}
                      </Button>
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
          <p className="text-sm text-muted-foreground">
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
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}