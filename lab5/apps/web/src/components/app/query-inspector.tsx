import { Gauge } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { onOperation, type OperationTrace } from "@/lib/graphql"

/** Client-side view of every GraphQL operation: latency, demand-control cost, cache hits. */
export function QueryInspector() {
  const [traces, setTraces] = useState<OperationTrace[]>([])
  useEffect(() => {
    const off = onOperation((t) => setTraces((prev) => [t, ...prev].slice(0, 100)))
    return () => {
      off()
    }
  }, [])
  const last = traces[0]
  const hits = traces.filter((t) => t.cacheHit).length

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-mono text-xs">
          <Gauge className="size-4" />
          {last ? `${last.durationMs} мс` : "GraphQL"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Инспектор GraphQL</SheetTitle>
          <SheetDescription>
            Операции этой вкладки к шлюзу федерации: время ответа, оценка стоимости (demand control) и попадания в
            кеш ответов. Попаданий в кеш: {hits} из {traces.length}.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-auto px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Операция</TableHead>
                <TableHead className="text-right">Время</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Кеш</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">
                    {t.kind === "mutation" && <Badge variant="outline" className="mr-1">M</Badge>}
                    {t.name}
                    {t.errors > 0 && <Badge variant="destructive" className="ml-1">{t.errors} err</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{t.durationMs} мс</TableCell>
                  <TableCell className="text-right font-mono text-xs">{t.cost ?? "—"}</TableCell>
                  <TableCell>{t.cacheHit ? <Badge variant="secondary">hit</Badge> : <span className="text-xs text-muted-foreground">miss</span>}</TableCell>
                </TableRow>
              ))}
              {traces.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Операции появятся после навигации по приложению
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}
