import { useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  TagChip,
  useConfirm,
  useTheme,
  useToast,
} from '@reporter/ui';
import { TAG_COLORS, defaultTagColorFor } from '@reporter/shared';
import { useCreateTag, useDeleteTag, useTags } from '../../api/hooks.js';
import { READ_ONLY_TITLE } from '../../lib/permissions.js';

/**
 * Tag list + "new tag" form for one engagement. Presentational block meant to
 * live inside a Settings Card. Tags are scoped to the engagement.
 */
export function TagManager({ slug, readOnly = false }: { slug: string; readOnly?: boolean }) {
  const { data: tags, isLoading, isError, refetch } = useTags(slug);
  const create = useCreateTag(slug);
  const del = useDeleteTag(slug);
  const toast = useToast();
  const confirm = useConfirm();
  const { resolved } = useTheme();

  const [name, setName] = useState('');
  const [color, setColor] = useState('teal');

  async function removeTag(id: number, tagName: string) {
    const ok = await confirm({
      title: 'Delete tag',
      message: `Delete the tag “${tagName}”? It will be removed from all evidence in this engagement.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  async function add() {
    if (!name) return;
    try {
      await create.mutateAsync({ name, colorName: color });
      setName('');
      setColor(defaultTagColorFor(name));
      toast.success('Tag created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create tag');
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load tags." onRetry={() => refetch()} />
      ) : !tags || tags.length === 0 ? (
        <EmptyState
          title="No tags yet"
          description="Create tags to organize and filter evidence."
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <TagChip
                name={t.name}
                colorName={t.colorName}
                onRemove={() => removeTag(t.id, t.name)}
                removeDisabled={readOnly}
                removeTitle={readOnly ? READ_ONLY_TITLE : undefined}
              />
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-text">New tag</p>
        <Field label="Name" htmlFor="tag-name">
          <Input
            id="tag-name"
            value={name}
            disabled={readOnly}
            onChange={(e) => {
              setName(e.target.value);
              setColor(defaultTagColorFor(e.target.value));
            }}
          />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                aria-label={c.name}
                disabled={readOnly}
                onClick={() => setColor(c.name)}
                className={`h-6 w-6 rounded-full disabled:opacity-50 ${color === c.name ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
                style={{ backgroundColor: resolved === 'dark' ? c.dark : c.light }}
              />
            ))}
          </div>
        </Field>
        <Button
          onClick={add}
          loading={create.isPending}
          disabled={readOnly || !name}
          title={readOnly ? READ_ONLY_TITLE : undefined}
        >
          Add tag
        </Button>
      </div>
    </div>
  );
}
