import { useState } from 'react';
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { CostNode } from '@costing/shared';
import { formatMoney, formatQuantity } from '../lib/format';

/**
 * The multi-level cost grid. It renders exactly what the engine returned — one
 * row per part, expandable into sub-parts, with the per-level cost breakdown.
 * It does no arithmetic of its own.
 */
export function CostTree({ tree, currency }: { tree: CostNode; currency: string }) {
  const [expanded, setExpanded] = useState<ExpandedState>(true);

  const money = (v: string) => formatMoney(v, currency);

  const columns: ColumnDef<CostNode>[] = [
    {
      id: 'part',
      header: 'Part',
      cell: ({ row }) => (
        <div className="tree-cell" style={{ paddingLeft: `${row.depth * 18}px` }}>
          {row.getCanExpand() ? (
            <button className="tree-toggle" onClick={row.getToggleExpandedHandler()}>
              {row.getIsExpanded() ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}
          <span className="tree-name">{row.original.name}</span>
          {row.original.materialId && <span className="pill">{row.original.materialId}</span>}
        </div>
      ),
    },
    {
      id: 'quantity',
      header: 'Qty',
      cell: ({ row }) => <span className="num">{formatQuantity(row.original.quantity)}</span>,
    },
    {
      id: 'effQuantity',
      header: 'Total qty',
      cell: ({ row }) => (
        <span className="num muted">{formatQuantity(row.original.effectiveQuantity)}</span>
      ),
    },
    {
      id: 'unitPrice',
      header: 'Unit price',
      cell: ({ row }) =>
        row.original.unitMaterialPrice ? (
          <span className="num">{money(row.original.unitMaterialPrice)}</span>
        ) : (
          <span className="num muted">—</span>
        ),
    },
    {
      id: 'material',
      header: 'Material',
      cell: ({ row }) => <span className="num">{money(row.original.cost.material)}</span>,
    },
    {
      id: 'labour',
      header: 'Labour',
      cell: ({ row }) => <span className="num">{money(row.original.cost.labour)}</span>,
    },
    {
      id: 'machine',
      header: 'Machine',
      cell: ({ row }) => <span className="num">{money(row.original.cost.machine)}</span>,
    },
    {
      id: 'overhead',
      header: 'Overhead',
      cell: ({ row }) => <span className="num">{money(row.original.cost.overhead)}</span>,
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => <span className="num strong">{money(row.original.cost.total)}</span>,
    },
  ];

  const table = useReactTable({
    data: [tree],
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.children,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="table-scroll">
      <table className="cost-table">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className={h.id === 'part' ? 'col-part' : 'col-num'}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={row.depth === 0 ? 'row-root' : ''}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={cell.column.id === 'part' ? 'col-part' : 'col-num'}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
