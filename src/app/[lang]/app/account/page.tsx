import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { auth, signOut } from "@/auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"
import { getPlan, planName } from "@/lib/plans"

export const metadata: Metadata = {
  title: "Cuenta",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app/account`)}`)
  }

  const dict = await getDictionary()
  const planRow = await getPlan(session.user.plan)
  const plan = planRow ? planName(planRow, locale) : session.user.plan

  async function logoutAction(formData: FormData) {
    "use server"
    const targetLocale = isLocale(String(formData.get("locale")))
      ? String(formData.get("locale"))
      : "es"
    await signOut({ redirectTo: `/${targetLocale}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{dict.app.account}</CardTitle>
        <CardDescription>{session.user.email}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="divide-y rounded-lg border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">
              {dict.app.emailLabel}
            </dt>
            <dd className="text-sm font-medium">{session.user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">
              {dict.app.planLabel}
            </dt>
            <dd className="text-sm font-medium">{plan}</dd>
          </div>
        </dl>
        <form action={logoutAction} className="flex justify-end">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline">
            {dict.app.logout}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}