import { useState } from 'react';
import { Button, Input, Select, useToast } from '@reporter/ui';
import { useCreateFindingCategory, useFindingCategories } from '../../api/hooks.js';

// Sentinel option value that switches the control into "create a new category" mode.
const NEW = '__new__';

/**
 * Category picker for a finding: a dropdown of the engagement's existing finding
 * categories with an inline "add new" flow. Categories are specific to this
 * engagement; creating one requires write access (callers only render this in
 * write-enabled contexts). Reusable across the create-finding modal and the
 * finding editor.
 */
export function CategorySelect({
  slug,
  value,
  onChange,
  id,
  disabled = false,
}: {
  slug: string;
  /** Currently selected category, or '' for none. */
  value: string;
  onChange: (category: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const { data: categories } = useFindingCategories(slug);
  const create = useCreateFindingCategory(slug);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const options = categories ?? [];
  const known = new Set(options.map((c) => c.category));
  // Keep showing a value that isn't in the list (a legacy free-text category, or
  // a just-created one the list hasn't refetched yet) so the selection sticks.
  const showCurrentAsExtra = value !== '' && !known.has(value);

  async function addNew() {
    const category = newName.trim();
    if (!category) return;
    const existing = options.find((c) => c.category.toLowerCase() === category.toLowerCase());
    if (existing) {
      onChange(existing.category);
      setNewName('');
      setAdding(false);
      return;
    }
    try {
      const created = await create.mutateAsync({ category });
      onChange(created.category);
      setNewName('');
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create category');
    }
  }

  function cancelAdd() {
    setAdding(false);
    setNewName('');
  }

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addNew();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelAdd();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void addNew()}
          loading={create.isPending}
          disabled={!newName.trim()}
        >
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={cancelAdd}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
    >
      <option value="">— None —</option>
      {showCurrentAsExtra && <option value={value}>{value}</option>}
      {options.map((c) => (
        <option key={c.id} value={c.category}>
          {c.category}
        </option>
      ))}
      <option value={NEW}>＋ Add new category…</option>
    </Select>
  );
}
