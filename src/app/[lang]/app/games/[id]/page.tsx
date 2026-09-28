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
    <div className="game-detail">
      <Link href={`/${locale}/app`} className="game-form__back">
        <ArrowLeft aria-hidden="true" />
        {inv.backToInventory}
      </Link>

      <div className="page-head">
        <div className="u-grow u-min-0">
          <div className="game-detail__title-row">
            <h1 className="page-title page-title--lg">
              {game.title}
            </h1>
            <Badge variant="secondary">{inv.statuses[game.status]}</Badge>
          </div>
          <p className="page-lead page-lead--spaced">
            {game.platform?.name}
            {game.genre ? ` · ${game.genre}` : ""}
          </p>
        </div>
        <div className="u-cluster u-cluster--tight">
          <Link
            href={`/${locale}/app/games/${game.id}/edit`}
            className={cn(buttonVariants({ size: "sm" }), "u-flex u-gap-2")}
          >
            <Pen className="u-icon" aria-hidden="true" />
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

      <div className="game-detail__body">
        <div>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={game.title}
              className="game-detail__cover"
            />
          ) : (
            <div className="game-detail__cover game-detail__cover--empty">
              <Gamepad2 aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="game-detail__main">
          <div className="game-detail__tags">
            {meta.map(({ label, value }) => (
              <div
                key={label}
                className="game-detail__tag"
              >
                <p className="game-detail__tag-key">{label}</p>
                <p className="game-detail__tag-value">{value}</p>
              </div>
            ))}
          </div>

          {game.notes ? (
            <div className="game-detail__panel">
              <h2 className="game-detail__panel-title">{inv.notes}</h2>
              <p className="game-detail__panel-body">{game.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {images.length > 0 && (
        <div className="game-detail__actions">
          <h2 className="game-detail__panel-title">{inv.galleryTitle}</h2>
          <ImageLightbox images={images} dict={inv} />
        </div>
      )}
    </div>
  )
}