import { useMemo, useState } from "react"
import { format } from "date-fns"
import { Activity, RefreshCw, X } from "lucide-react"
import { useActivityFeed } from "./hooks"
import { ACTIVITY_FEED_CONFIG, ACTIVITY_ENTITY_TYPES, availableEventTypes } from "./activity-feed-config"
import { EventDiff } from "@/features/bookings/event-diff"
import { useMembers } from "@/features/members/hooks"
import { useCurrentOrg } from "@/features/organizations/context"
import { dedupeById } from "@/lib/pagination"
import { t, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Feed unificat de activitate per proprietate — toate evenimentele din
// entity_events + booking_events + unit_events + unit_type_events, în ordine
// cronologică (RPC get_activity_feed). O entitate nouă apare automat aici de
// îndată ce e înregistrată în ACTIVITY_FEED_CONFIG. Filtrele (tip/eveniment/
// interval) se aplică server-side, în RPC, pe coloane indexate.
export function ActivityFeed({ propertyId }: { propertyId: string }) {
  const { currentOrg } = useCurrentOrg()
  const [entityTypes, setEntityTypes] = useState<string[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const filters = {
    entityTypes,
    eventTypes,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  }
  const query = useActivityFeed(propertyId, filters)
  const { data: members } = useMembers(currentOrg.id)
  const items = dedupeById(query.data?.pages.flatMap((p) => p.items))

  const nameByEmail = useMemo(
    () => new Map((members ?? []).map((m) => [m.email, m.full_name])),
    [members]
  )
  const actorName = (email: string | null) =>
    (email && (nameByEmail.get(email) ?? email)) || null

  const hasFilters = entityTypes.length > 0 || eventTypes.length > 0 || !!dateFrom || !!dateTo

  function toggleEntityType(value: string) {
    setEntityTypes((cur) => {
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      // tipurile de eveniment bifate care nu mai au sens pentru noua selecție de entități
      const stillValid = new Set(availableEventTypes(next))
      setEventTypes((evs) => evs.filter((e) => stillValid.has(e)))
      return next
    })
  }
  function toggleEventType(value: string) {
    setEventTypes((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]))
  }
  function clearFilters() {
    setEntityTypes([])
    setEventTypes([])
    setDateFrom("")
    setDateTo("")
  }

  const entityOptions = ACTIVITY_ENTITY_TYPES.map((type) => ({
    value: type,
    label: t(ACTIVITY_FEED_CONFIG[type].entityLabel),
  }))
  const eventOptions = availableEventTypes(entityTypes).map((type) => ({
    value: type,
    label: t(`activity.event_type.${type}` as TranslationKey),
  }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <MultiSelectFilter
          label={t("activity.filter.entity_type")}
          options={entityOptions}
          selected={entityTypes}
          onToggle={toggleEntityType}
        />
        <MultiSelectFilter
          label={t("activity.filter.event_type")}
          options={eventOptions}
          selected={eventTypes}
          onToggle={toggleEventType}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("activity.filter.date_from")}</Label>
          <Input
            type="date" className="h-9 w-36"
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("activity.filter.date_to")}</Label>
          <Input
            type="date" className="h-9 w-36" min={dateFrom || undefined}
            value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            {t("activity.filter.clear")}
          </Button>
        )}
        <Button
          variant="outline" size="sm" className="ml-auto"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")} />
          {t("activity.refresh")}
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !items || items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Activity className="h-8 w-8" />
            {t("activity.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 py-4">
            {items.map((ev) => {
              const config = ACTIVITY_FEED_CONFIG[ev.entity_type]
              const eventLabel = config?.eventLabels[ev.event_type] ?? null
              const who = actorName(ev.actor_email)
              return (
                <div key={ev.id} className="flex items-start gap-3 border-b pb-3 text-sm last:border-0 last:pb-0">
                  <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 space-y-0.5">
                    <p>
                      {who && <span className="font-medium">{who}</span>}
                      {" — "}
                      <span className={who ? "" : "font-medium"}>
                        {config ? t(config.entityLabel) : ev.entity_type}
                      </span>
                      {": "}
                      {eventLabel ? t(eventLabel) : ev.event_type}
                    </p>
                    {config && <EventDiff oldData={ev.old_data} newData={ev.new_data} fields={config.fields} />}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(ev.created_at), "dd.MM.yyyy HH:mm")}
                  </span>
                </div>
              )
            })}
            <div className="flex justify-center pt-1">
              {query.hasNextPage ? (
                <Button
                  variant="ghost" size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  {t("common.show_more")}
                </Button>
              ) : (query.data?.pages.length ?? 0) > 1 ? (
                <p className="text-center text-xs text-muted-foreground">{t("history.end")}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
