import { Select } from '@reporter/ui';

/**
 * The two always-relevant single-choice controls, rendered inline (not in
 * popovers): finding status and sort order.
 */
export function FindingSortControls({
  withFinding,
  sortAsc,
  onChange,
}: {
  withFinding?: boolean;
  sortAsc: boolean;
  onChange: (next: { withFinding?: boolean; sortAsc: boolean }) => void;
}) {
  const findingValue = withFinding === undefined ? 'any' : withFinding ? 'with' : 'without';

  return (
    <>
      <div className="w-44">
        <Select
          value={findingValue}
          aria-label="Filter by finding status"
          onChange={(e) => {
            const v = e.target.value;
            onChange({ withFinding: v === 'any' ? undefined : v === 'with', sortAsc });
          }}
        >
          <option value="any">Any finding status</option>
          <option value="with">With a finding</option>
          <option value="without">Without a finding</option>
        </Select>
      </div>
      <div className="w-36">
        <Select
          value={sortAsc ? 'asc' : 'desc'}
          aria-label="Sort order"
          onChange={(e) => onChange({ withFinding, sortAsc: e.target.value === 'asc' })}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </Select>
      </div>
    </>
  );
}
