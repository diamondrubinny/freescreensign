/** The value of the "no change" choice. */
export const KEEP = '__keep__';

export function ContentSelect({
  id,
  name,
  label,
  emptyLabel,
  hint,
  options,
  defaultValue,
  keepLabel,
}: {
  id: string;
  name: string;
  label: string;
  emptyLabel: string;
  hint?: string;
  options: { id: string; name: string }[];
  defaultValue: string | null;
  /** Adds a first, default choice that leaves the value unchanged (value KEEP). */
  keepLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
          {hint}
        </p>
      )}
      <select
        id={id}
        name={name}
        defaultValue={keepLabel ? KEEP : (defaultValue ?? '')}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-md border border-gray-500 bg-white px-3 py-2 dark:bg-gray-900"
      >
        {keepLabel && <option value={KEEP}>{keepLabel}</option>}
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
