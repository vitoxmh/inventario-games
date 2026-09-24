import Link from "next/link"
import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"
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
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="size-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {dict.app.suspendedTitle}
        </h1>
        <p className="text-muted-foreground">{dict.app.suspendedBody}</p>
      </div>
      <Link href={`/${locale}`} className={buttonVariants({ variant: "outline" })}>
        {dict.app.returnHome}
      </Link>
    </div>
  )
}