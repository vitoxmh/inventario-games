import Link from "next/link"
import { lang } from "next/root-params"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export default async function NotFound() {
  const dict = await getDictionary()
  const currentLocale = await lang()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <h1 className="text-4xl font-bold tracking-tight">{dict.notFound.title}</h1>
      <p className="text-muted-foreground">{dict.notFound.description}</p>
      <Link href={`/${currentLocale}`} className={buttonVariants()}>
        {dict.notFound.home}
      </Link>
    </div>
  )
}