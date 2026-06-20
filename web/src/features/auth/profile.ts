import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useSession } from "./hooks"

export const profileKeys = {
  mine: (userId: string) => ["profile", userId] as const,
}

export function useMyProfile() {
  const { session } = useSession()
  const userId = session?.user.id
  return useQuery({
    queryKey: profileKeys.mine(userId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", userId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

export function useUpdateMyProfile() {
  const { session } = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fullName: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, updated_at: new Date().toISOString() })
        .eq("user_id", session!.user.id)
      if (error) throw error
    },
    onSuccess: () => {
      if (session) qc.invalidateQueries({ queryKey: profileKeys.mine(session.user.id) })
    },
  })
}
