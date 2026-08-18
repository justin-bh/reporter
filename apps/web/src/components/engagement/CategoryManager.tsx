import { useState, type FormEvent } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  useConfirm,
  useToast,
} from '@reporter/ui';
import {
  useCreateFindingCategory,
  useDeleteFindingCategory,
  useFindingCategories,
} from '../../api/hooks.js';

/**
 * Finding-category list + add form. Presentational block meant to live inside a
 * Settings Card. Categories are shared across all engagements; deleting one is a
 * soft-delete and existing findings keep their label.
 */
export function CategoryManager({ slug }: { slug: string }) {
  const { data: categories, isLoading, isError, refetch } = useFindingCategories(slug);
  const create = useCreateFindingCategory(slug);
  const del = useDeleteFindingCategory(slug);
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState('');

  async function removeCategory(id: number, category: string) {
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete the category “${category}”? Categories are shared across all engagements; existing findings keep their label.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(id);
      toast.success('Category deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete category');
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const category = name.trim();
    if (!category) return;
    try {
      await create.mutateAsync({ category });
      setName('');
      toast.success('Category created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create category');
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load categories." onRetry={() => refetch()} />
      ) : !categories || categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Add a category to group findings; categories are shared across engagements."
        />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text"
            >
              <span>{c.category}</span>
              <button
                type="button"
                onClick={() => removeCategory(c.id, c.category)}
                className="text-muted hover:text-danger"
                aria-label={`Delete category ${c.category}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-text">New category</p>
        <div className="flex items-end gap-2">
          <Field label="Name" htmlFor="cat-name" className="flex-1">
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Access Control"
            />
          </Field>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}
