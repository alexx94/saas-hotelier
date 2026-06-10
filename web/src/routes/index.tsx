import { createFileRoute, redirect } from "@tanstack/react-router"
import { requireSession } from "@/features/auth/hooks"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await requireSession()
    throw redirect({ to: session ? "/app" : "/login" })
  },
})
