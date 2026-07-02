'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table'
import { formatDate, formatMicroGbp } from '@/lib/format'
import { addToReviewBatch, generateBatch } from '@/server/actions/generation'
import { Badge, entityTone, segmentTone, statusTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableShell, Td, Th } from '@/components/ui/table'

export type PipelineRow = {
  id: string
  name: string
  trade: string | null
  city: string | null
  segment: string | null
  healthScore: number | null
  entityType: string
  status: string
  slug: string | null
  previewHref: string | null
  costMicroGbp: number
  createdAt: string
}

export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [message, setMessage] = useState<string | null>(null)
  const [batchLink, setBatchLink] = useState<string | null>(null)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchLabel, setBatchLabel] = useState('')
  const [autoApprove, setAutoApprove] = useState(false)
  const [pending, startTransition] = useTransition()

  const columns = useMemo<ColumnDef<PipelineRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all rows"
            className="accent-indigo-600"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.name}`}
            className="accent-indigo-600"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        header: 'Name',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link
            href={`/prospects/${row.original.id}`}
            className="font-medium text-zinc-900 hover:text-indigo-600 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      { header: 'Trade', accessorKey: 'trade', cell: ({ getValue }) => getValue() ?? '—' },
      { header: 'City', accessorKey: 'city', cell: ({ getValue }) => getValue() ?? '—' },
      {
        header: 'Segment',
        accessorKey: 'segment',
        cell: ({ row }) =>
          row.original.segment ? (
            <Badge tone={segmentTone(row.original.segment)}>{row.original.segment}</Badge>
          ) : (
            '—'
          ),
      },
      {
        header: 'Health',
        accessorKey: 'healthScore',
        cell: ({ getValue }) => {
          const value = getValue<number | null>()
          return value === null ? '—' : <span className="font-mono text-xs">{value}</span>
        },
      },
      {
        header: 'Entity',
        accessorKey: 'entityType',
        cell: ({ row }) => (
          <Badge tone={entityTone(row.original.entityType)}>{row.original.entityType}</Badge>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <Badge tone={statusTone(row.original.status)}>{row.original.status}</Badge>
        ),
      },
      {
        header: 'Preview',
        id: 'preview',
        cell: ({ row }) =>
          row.original.previewHref ? (
            <a
              href={row.original.previewHref}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {row.original.slug} ↗
            </a>
          ) : (
            <span className="text-zinc-400">no site</span>
          ),
      },
      {
        header: 'Cost',
        accessorKey: 'costMicroGbp',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{formatMicroGbp(getValue<number>())}</span>
        ),
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        cell: ({ getValue }) => (
          <span className="text-xs text-zinc-500">{formatDate(getValue<string>())}</span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  const runGenerate = () => {
    setMessage(null)
    setBatchLink(null)
    startTransition(async () => {
      const result = await generateBatch(selectedIds)
      setRowSelection({})
      setMessage(
        result.failures.length > 0
          ? `Generated ${result.generated}, failed ${result.failures.length}: ${result.failures
              .map((f) => f.error)
              .join('; ')}`
          : `Generated ${result.generated} site${result.generated === 1 ? '' : 's'}`,
      )
    })
  }

  const runAddToBatch = () => {
    setMessage(null)
    setBatchLink(null)
    startTransition(async () => {
      const result = await addToReviewBatch(selectedIds, { label: batchLabel, autoApprove })
      if ('error' in result) {
        setMessage(result.error)
      } else {
        setRowSelection({})
        setBatchDialogOpen(false)
        setMessage(
          `Added ${result.added} to review batch${result.skipped > 0 ? ` (${result.skipped} skipped — no site)` : ''}`,
        )
        setBatchLink(`/review/${result.batchId}`)
      }
    })
  }

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
          <span className="text-sm font-medium text-indigo-800">{selectedIds.length} selected</span>
          <Button variant="primary" onClick={runGenerate} disabled={pending}>
            {pending ? 'Working…' : 'Generate'}
          </Button>
          <Button onClick={() => setBatchDialogOpen(true)} disabled={pending}>
            Add to review batch
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="text-sm text-zinc-600">
          {message}
          {batchLink ? (
            <Link href={batchLink} className="ml-2 font-medium text-indigo-600 hover:underline">
              Open batch →
            </Link>
          ) : null}
        </p>
      ) : null}

      <TableShell>
        <Table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </Th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} data-testid="pipeline-row" className="hover:bg-zinc-50">
                {row.getVisibleCells().map((cell) => (
                  <Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={columns.length} className="py-8 text-center text-zinc-400">
                  No prospects match these filters
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </TableShell>

      <Dialog
        open={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        title="Add to review batch"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="batch-label">Batch label</Label>
            <Input
              id="batch-label"
              className="mt-1"
              value={batchLabel}
              onChange={(event) => setBatchLabel(event.target.value)}
              placeholder="e.g. Leeds plumbers w27"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={autoApprove}
              onChange={(event) => setAutoApprove(event.target.checked)}
            />
            Auto-approve when the batch deadline passes
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={runAddToBatch} disabled={pending}>
              {pending ? 'Creating…' : 'Create batch'}
            </Button>
          </div>
          {message ? <p className="text-xs text-red-600">{message}</p> : null}
        </div>
      </Dialog>
    </div>
  )
}
