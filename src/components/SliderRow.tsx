import { useEditParams } from '../state/editParams';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  onChange: (value: number) => void;
}

export function SliderRow({ label, value, min, max, step = 1, defaultValue = 0, onChange }: Props) {
  const beginChange = useEditParams((s) => s.beginChange);

  const handleReset = () => {
    if (value === defaultValue) return;
    beginChange();
    onChange(defaultValue);
  };

  return (
    <label className="block mb-3 text-xs text-neutral-400 select-none">
      <div className="flex justify-between mb-1">
        <span>{label}</span>
        <span className="text-neutral-500 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={beginChange}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={handleReset}
        title={`Double-click to reset to ${defaultValue}`}
        className="w-full"
      />
    </label>
  );
}
