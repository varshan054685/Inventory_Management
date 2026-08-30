import React, { useState } from 'react';
import { SearchInput, Pagination, EmptyState, StatusBadge, Button, ConfirmDialog } from '@/components/ui';
import { Plus, Pencil, Trash2, ToggleLeft } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T extends { id: number }> {
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  error?: string | null;
  searchPlaceholder?: string;
  onCreate?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onToggleStatus?: (row: T) => void;
  pageSize?: number;
  emptyMessage?: string;
}

export function MasterList<T extends { id: number }>({
  title,
  subtitle,
  columns,
  rows,
  loading,
  error,
  searchPlaceholder,
  onCreate,
  onEdit,
  onDelete,
  onToggleStatus,
  pageSize = 10,
  emptyMessage,
}: Props<T>) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [confirming, setConfirming] = useState(false);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const hay = Object.values(r as Record<string, unknown>)
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .join(' ')
      .toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirming(true);
    try {
      onDelete?.(deleteTarget);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  const actionsCol: Column<T> = {
    key: '__actions',
    header: 'Actions',
    className: 'text-right',
    render: (row) => (
      <div className="flex justify-end gap-1">
        {onToggleStatus && (
          <button className="btn-ghost p-1.5 rounded" title="Toggle status" onClick={() => onToggleStatus(row)}>
            <ToggleLeft className="w-4 h-4" />
          </button>
        )}
        {onEdit && (
          <button className="btn-ghost p-1.5 rounded" title="Edit" onClick={() => onEdit(row)}>
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {onDelete && (
          <button
            className="btn-ghost p-1.5 rounded text-red-500"
            title="Delete"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    ),
  };
  const showActions = onDelete || onEdit || onToggleStatus;
  const allCols = showActions ? [...columns, actionsCol] : columns;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={searchPlaceholder} className="w-56" />
          {onCreate && (
            <Button variant="primary" onClick={onCreate}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          )}
        </div>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {loading && !rows.length ? (
        <EmptyState message="Loading…" />
      ) : total === 0 ? (
        <EmptyState message={emptyMessage ?? 'No records found'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {allCols.map((c) => (
                    <th key={c.key} className={`px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500 ${c.className ?? ''}`}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/60">
                    {allCols.map((c) => (
                      <td key={c.key} className={`px-3 py-2.5 ${c.className ?? ''}`}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > pageSize && <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete record"
        message="Are you sure you want to delete this record? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}