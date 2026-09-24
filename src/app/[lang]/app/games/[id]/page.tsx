import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { lang } from "next/root-params"
import { ArrowLeft, Gamepad2, Pen } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GameDetailActions } from "@/components/inventory/game-detail-actions"
import { ImageLightbox } from "@/components/inventory/image-lightbox"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(
      `/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app/games/${id}`)}`,
    )
  }

  const dict = await getDictionary()
  const inv = dict.inventory

  const game = await prisma.game.findFirst({
    where: { id, userId: session.user.id },
    include: {
      images: { orderBy: { position: "asc" } },
      platform: { select: { name: true } },
    },
  })
  if (!game) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-US",
    { dateStyle: "long" },
  )
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  })

  const cover = game.images[0]?.url ?? game.coverImageUrl
  const images = game.images.map((image) => image.url)
  const price =
    game.purchasePrice != null
      ? currencyFormatter.format(Number(game.purchasePrice))
      : null
  const playtime =
    game.playtimeMin != null && game.playtimeMin > 0
      ? `${Math.round(game.playtimeMin / 60)} ${inv.playtime}`
      : null

  const meta: Array<{ label: string; value: string }> = [
    { label: inv.platform, value: game.platform?.name ?? "—" },
    { label: inv.genre, value: game.genre ?? "—" },
    { label: inv.condition, value: game.condition ?? "—" },
    { label: inv.playtimeLabel, value: playtime ?? "—" },
    { label: inv.purchasePrice, value: price ?? "—" },
    {
      label: inv.purchaseDate,
      value: game.purchaseDate
        ? dateFormatter.format(new Date(game.purchaseDate))
        : "—",
    },
    { label: inv.addedAt, value: dateFormatter.format(new Date(game.createdAt)) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${locale}/app`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {inv.backToInventory}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {game.title}
            </h1>
            <Badge variant="secondary">{inv.statuses[game.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {game.platform?.name}
            {game.genre ? ` · ${game.genre}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/app/games/${game.id}/edit`}
            className={cn(
              buttonVariants({ size: "sm" }),
              "inline-flex items-center gap-1.5",
            )}
          >
            <Pen className="size-4" aria-hidden="true" />
            {inv.edit}
          </Link>
          <GameDetailActions
            gameId={game.id}
            title={game.title}
            dict={inv}
            lang={locale}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <div>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={game.title}
              className="aspect-[3/4] w-full rounded-xl border object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border bg-muted">
              <Gamepad2
                className="size-12 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {meta.map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-lg border bg-card p-3"
              >
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  {label}
                </p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {game.notes ? (
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {inv.notes}
              </h2>
              <p className="mt-2 text-sm whitespace-pre-wrap">{game.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {images.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {inv.galleryTitle}
          </h2>
          <ImageLightbox images={images} dict={inv} />
        </div>
      )}
    </div>
  )
}