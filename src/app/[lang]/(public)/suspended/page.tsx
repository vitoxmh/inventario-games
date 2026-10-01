import Link from "next/link"
import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Home, ShieldAlert } from "lucide-react"
import { auth } from "@/auth"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  title: "Cuenta suspendida",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function SuspendedPage() {
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  const dict = await getDictionary()

  if (!session?.user?.banned) {
    redirect(`/${locale}`)
  }

  return (
    <div className="status-page">
      <div className="status-page__icon">
        <ShieldAlert aria-hidden="true" />
      </div>
      <div className="status-page__body">
        <h1 className="status-page__title">{dict.app.suspendedTitle}</h1>
        <p className="status-page__text">{dict.app.suspendedBody}</p>
      </div>
      <Link href={`/${locale}`} className={buttonVariants({ variant: "outline" })}>
        <Home aria-hidden="true" />
        {dict.app.returnHome}
      </Link>
    </div>
  )
}