import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, EmptyState, useConfirm, useToast } from '@reporter/ui';
import type { FindingEvidence } from '@reporter/shared';
import {
  useDetachEvidence,
  useReorderEvidence,
  useUpdateFindingEvidence,
} from '../../api/hooks.js';
import { READ_ONLY_TITLE } from '../../lib/permissions.js';
import { FindingEvidenceCard } from './FindingEvidenceCard.js';

/**
 * Plain Attached Evidence bucket (inPath=false). Rich cards, drag-reorderable
 * within the bucket, with move-to-attack-path and detach actions.
 */
export function AttachedEvidenceSection({
  slug,
  findingUuid,
  items,
  onAttach,
  canWrite,
}: {
  slug: string;
  findingUuid: string;
  items: FindingEvidence[];
  onAttach: () => void;
  /** The user may edit the finding; false renders every mutating control disabled. */
  canWrite: boolean;
}) {
  const reorder = useReorderEvidence(slug, findingUuid);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = items.map((ev) => ev.uuid);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Reorder ONLY this bucket's uuids.
    reorder.mutate(arrayMove(ids, from, to));
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Attached Evidence ({items.length})</h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={onAttach}
          disabled={!canWrite}
          title={canWrite ? undefined : READ_ONLY_TITLE}
        >
          Attach
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No attached evidence yet."
          description="Attach evidence that supports this finding but isn't part of the ordered attack path."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={onAttach}
              disabled={!canWrite}
              title={canWrite ? undefined : READ_ONLY_TITLE}
            >
              Attach
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((e) => e.uuid)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((ev) => (
                <SortableAttached
                  key={ev.uuid}
                  slug={slug}
                  findingUuid={findingUuid}
                  ev={ev}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}

function SortableAttached({
  slug,
  findingUuid,
  ev,
  canWrite,
}: {
  slug: string;
  findingUuid: string;
  ev: FindingEvidence;
  canWrite: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const detach = useDetachEvidence(slug, findingUuid);
  const update = useUpdateFindingEvidence(slug, findingUuid);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.uuid,
    disabled: !canWrite,
  });

  async function onDetach() {
    const ok = await confirm({
      title: 'Detach evidence',
      message: 'Detach this evidence from the finding? The evidence itself is kept.',
      confirmLabel: 'Detach',
      danger: true,
    });
    if (!ok) return;
    detach.mutate(ev.uuid);
  }

  function onMove() {
    update.mutate(
      { evidenceUuid: ev.uuid, patch: { inPath: true } },
      {
        onSuccess: () => toast.success('Moved to attack path'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Move failed'),
      },
    );
  }

  return (
    <li>
      <FindingEvidenceCard
        slug={slug}
        ev={ev}
        variant="attached"
        drag={{
          setNodeRef,
          style: {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.6 : 1,
          },
          attributes,
          listeners,
          isDragging,
        }}
        onMove={onMove}
        onDetach={onDetach}
        moving={update.isPending}
        readOnly={!canWrite}
      />
    </li>
  );
}
