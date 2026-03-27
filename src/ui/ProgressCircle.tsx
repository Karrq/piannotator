interface ProgressCircleProps {
  total: number;
  viewed: number;
}

export function ProgressCircle({ total, viewed }: ProgressCircleProps) {
  if (total === 0) {
    return null;
  }

  const r = 12;
  const circumference = 2 * Math.PI * r;
  const filled = total > 0 ? (viewed / total) * circumference : 0;

  return (
    <svg width={28} height={28} viewBox="0 0 28 28" className="progress-circle">
      <circle cx={14} cy={14} r={r} fill="none" stroke="#30363d" strokeWidth={3} />
      <circle
        cx={14}
        cy={14}
        r={r}
        fill="none"
        stroke="#3fb950"
        strokeWidth={3}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.3s ease" }}
      />
    </svg>
  );
}
