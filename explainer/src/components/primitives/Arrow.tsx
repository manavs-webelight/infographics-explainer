import {evolvePath} from '@remotion/paths';
import {theme} from '../../theme';

export type Point = {x: number; y: number};

// Polyline arrow that draws itself on as progress goes 0 -> 1 (evolvePath).
// The arrowhead pops in at the end of the draw. Renders inside an <svg>.
export const Arrow: React.FC<{
  points: Point[];
  progress: number; // 0..1, frame-driven by the caller
  color?: string;
  width?: number;
}> = ({points, progress, color = theme.muted, width = 4}) => {
  if (points.length < 2) return null;
  const d = `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
  const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
  const hs = 13;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
      <polygon
        points={`${last.x},${last.y} ${last.x - hs * Math.cos(ang - 0.42)},${last.y - hs * Math.sin(ang - 0.42)} ${last.x - hs * Math.cos(ang + 0.42)},${last.y - hs * Math.sin(ang + 0.42)}`}
        fill={color}
        opacity={progress > 0.96 ? 1 : 0}
      />
    </g>
  );
};
