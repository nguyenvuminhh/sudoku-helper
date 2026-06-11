"use client";

export function SwitchRow({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "switch-row active" : "switch-row"}
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label={label}
    >
      <span className="switch-copy">
        {icon}
        {label}
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
