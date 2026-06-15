import { useState } from 'react';
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { BomNode, CostNode, Rates } from '@costing/shared';
import { formatMoney, formatQuantity } from '../lib/format';

interface Props {
  bom: BomNode;
  costIndex: Map<string, CostNode>;
  materials: Rates['materials'];
  currency: string;
  changedQtys: Set<string>;
  changedMaterials: Set<string>;
  onQuantity: (nodeId: string, value: string) => void;
  onMaterialPrice: (materialId: string, value: string) => void;
}

/**
 * Editable multi-level grid. Quantities and material prices are edited here; the
 * computed cost columns come straight from the engine result (looked up by id).
 * Editing never computes a cost locally — it changes inputs and the parent
 * re-asks the engine.
 */
export function EditableCostTree({
  bom,
  costIndex,
  materials,
  currency,
  changedQtys,
  changedMaterials,
  onQuantity,
  onMaterialPrice,
}: Props) {
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const money = (v: string | undefined) => (v ? formatMoney(v, currency) : '—');
  const costOf = (id: string) => costIndex.get(id)?.cost;

  const columns: ColumnDef<BomNode>[] = [
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
      cell: ({ row }) => (
        <input
          className={`cell-input ${changedQtys.has(row.original.id) ? 'is-changed' : ''}`}
          type="number"
          min="0"
          step="any"
          value={String(row.original.quantity)}
          onChange={(e) => onQuantity(row.original.id, e.target.value)}
        />
      ),
    },
    {
      id: 'effQuantity',
      header: 'Total qty',
      cell: ({ row }) => (
        <span className="num muted">
          {formatQuantity(costIndex.get(row.original.id)?.effectiveQuantity ?? '')}
        </span>
      ),
    },
    {
      id: 'unitPrice',
      header: 'Unit price',
      cell: ({ row }) => {
        const mat = row.original.materialId;
        if (!mat) return <span className="num muted">—</span>;
        return (
          <input
            className={`cell-input ${changedMaterials.has(mat) ? 'is-changed' : ''}`}
            type="number"
            min="0"
            step="any"
            value={String(materials[mat]?.unitPrice ?? '')}
            onChange={(e) => onMaterialPrice(mat, e.target.value)}
          />
        );
      },
    },
    { id: 'material', header: 'Material', cell: ({ row }) => <span className="num">{money(costOf(row.original.id)?.material)}</span> },
    { id: 'labour', header: 'Labour', cell: ({ row }) => <span className="num">{money(costOf(row.original.id)?.labour)}</span> },
    { id: 'machine', header: 'Machine', cell: ({ row }) => <span className="num">{money(costOf(row.original.id)?.machine)}</span> },
    { id: 'overhead', header: 'Overhead', cell: ({ row }) => <span className="num">{money(costOf(row.original.id)?.overhead)}</span> },
    { id: 'total', header: 'Total', cell: ({ row }) => <span className="num strong">{money(costOf(row.original.id)?.total)}</span> },
  ];

  const table = useReactTable({
    data: [bom],
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.children,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.id,
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
