import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  Card,
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
import { useCreateTag, useDeleteTag, useTags } from '../api/hooks.js';

export function TagsPage() {
  const { slug = '' } = useParams();
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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="mb-3 text-lg font-semibold text-text">Tags</h2>
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
                />
              </span>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">New tag</h3>
        <Field label="Name" htmlFor="tag-name">
          <Input
            id="tag-name"
            value={name}
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
                onClick={() => setColor(c.name)}
                className={`h-6 w-6 rounded-full ${color === c.name ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
                style={{ backgroundColor: resolved === 'dark' ? c.dark : c.light }}
              />
            ))}
          </div>
        </Field>
        <Button onClick={add} loading={create.isPending} disabled={!name}>
          Add tag
        </Button>
      </Card>
    </div>
  );
}
