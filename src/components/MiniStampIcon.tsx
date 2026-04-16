import React from 'react';
import Svg, { Circle, Line, G, Defs, ClipPath } from 'react-native-svg';

const STAMP_PROOF = '#C4704B';
const STAMP_DECLINE = '#6B7A8D';

interface Props {
  type: 'proof' | 'declined';
  size?: number;
}

export const MiniStampIcon: React.FC<Props> = ({ type, size = 16 }) => {
  const color = type === 'proof' ? STAMP_PROOF : STAMP_DECLINE;
  const c = size / 2;
  const r = size * 0.33;
  const sw = Math.max(1, size * 0.1);
  const tickR1 = r + sw / 2 + 0.8;
  const tickR2 = tickR1 + size * 0.1;
  const ticks = 16;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <ClipPath id={`mc-${type}`}>
          <Circle cx={c} cy={c} r={r - sw / 2} />
        </ClipPath>
      </Defs>
      {/* Serrated edge ticks */}
      <G opacity={0.3}>
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i * 360 / ticks) * Math.PI / 180;
          return (
            <Line
              key={i}
              x1={c + Math.cos(a) * tickR1}
              y1={c + Math.sin(a) * tickR1}
              x2={c + Math.cos(a) * tickR2}
              y2={c + Math.sin(a) * tickR2}
              stroke={color}
              strokeWidth={1.2}
            />
          );
        })}
      </G>
      {/* Main circle ring */}
      <Circle cx={c} cy={c} r={r} fill={color + '20'} stroke={color} strokeWidth={sw} />
      {/* Diagonal hatching for declined */}
      {type === 'declined' && (
        <G clipPath={`url(#mc-${type})`} opacity={0.15}>
          {Array.from({ length: 8 }).map((_, i) => {
            const offset = (i - 4) * (size * 0.15);
            return (
              <Line
                key={`h${i}`}
                x1={c + offset - r}
                y1={c - r}
                x2={c + offset + r}
                y2={c + r}
                stroke={color}
                strokeWidth={0.8}
              />
            );
          })}
        </G>
      )}
    </Svg>
  );
};
