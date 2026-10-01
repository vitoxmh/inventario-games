/*
 * La navegación de la zona autenticada la pinta el shell de QuestVault en
 * `(app)/layout.tsx` (sidebar fijo), así que aquí ya no hay nada que envolver.
 * El archivo se conserva porque es el punto natural para las guardas y el
 * metadata propios de `/app`.
 */
export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
