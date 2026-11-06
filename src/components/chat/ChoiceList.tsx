"use client";

export function ChoiceList({
  choices,
  disabled,
  onPick,
  onOther,
}: {
  choices: { id: string; label: string }[];
  disabled?: boolean;
  onPick: (label: string) => void;
  onOther: () => void;
}) {
  if (!choices.length) return null;
  return (
    <div className="mt-3 flex max-w-[85%] flex-wrap gap-2">
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(choice.label)}
          className="rounded-full border border-[#D1D7E5] bg-white px-3 py-1.5 text-left text-sm text-[#080B3A] hover:border-[#0400FF] disabled:opacity-50"
        >
          {choice.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onOther}
        className="rounded-full border border-dashed border-[#0400FF] bg-white px-3 py-1.5 text-sm font-semibold text-[#0400FF] disabled:opacity-50"
      >
        Other
      </button>
    </div>
  );
}
