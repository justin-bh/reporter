import { useState } from 'react';
import { Button, Field, Input, Modal, Select, TagPicker, Textarea, useToast } from '@reporter/ui';
import {
  EVIDENCE_TYPE_LABELS,
  type CreateEvidenceInput,
  type EvidenceType,
} from '@reporter/shared';
import { useCreateEvidence, useTags } from '../../api/hooks.js';

const CREATABLE: EvidenceType[] = ['image', 'codeblock', 'none', 'event', 'http-request-cycle'];

export function CreateEvidenceModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: tags } = useTags(slug);
  const create = useCreateEvidence(slug);

  const [type, setType] = useState<EvidenceType>('image');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);

  const needsFile = type === 'image';
  const needsText = type !== 'image';
  const canSubmit = needsFile
    ? Boolean(file)
    : content.trim().length > 0 || description.trim().length > 0;

  function reset() {
    setType('image');
    setDescription('');
    setContent('');
    setLanguage('');
    setFile(null);
    setTagIds([]);
  }

  async function submit() {
    const metadata: CreateEvidenceInput = {
      contentType: type,
      description,
      tagIds,
      content: needsText ? content : undefined,
      contentSubtype: type === 'codeblock' && language ? language : undefined,
    };
    try {
      await create.mutateAsync({ metadata, file: needsFile && file ? file : undefined });
      toast.success('Evidence added');
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add evidence');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add evidence"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!canSubmit}>
            Add evidence
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="ev-type">
            <Select
              id="ev-type"
              value={type}
              onChange={(e) => setType(e.target.value as EvidenceType)}
            >
              {CREATABLE.map((t) => (
                <option key={t} value={t}>
                  {EVIDENCE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          {type === 'codeblock' && (
            <Field label="Language" htmlFor="ev-lang" hint="Optional">
              <Input
                id="ev-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="bash"
              />
            </Field>
          )}
        </div>

        <Field label="Description" htmlFor="ev-desc">
          <Input
            id="ev-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {needsFile ? (
          <Field label="Screenshot" htmlFor="ev-file" hint="PNG, JPEG, GIF, or WEBP.">
            <input
              id="ev-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-input file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-text"
            />
          </Field>
        ) : (
          <Field
            label={type === 'http-request-cycle' ? 'HTTP data (HAR JSON)' : 'Content'}
            htmlFor="ev-content"
          >
            <Textarea
              id="ev-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="font-mono"
            />
          </Field>
        )}

        <Field label="Tags">
          <TagPicker
            tags={tags ?? []}
            selectedIds={tagIds}
            onChange={setTagIds}
            emptyHint="No tags in this engagement yet — add some on the Tags tab."
          />
        </Field>
      </div>
    </Modal>
  );
}
