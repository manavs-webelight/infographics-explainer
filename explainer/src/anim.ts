import {spring, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
// 0 -> 1 spring starting after `delay` frames
export const useIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping: 200}});
};

// M5: step-level reveal. `steps` carry pipeline fields startFrame/frames.
// index = last step whose startFrame <= current frame (-1 before the first).
// progress = 0..1 through the current step's audio.
export const useStep = (steps: Array<{startFrame?: number; frames?: number}>) => {
  const frame = useCurrentFrame();
  let index = -1;
  for (let i = 0; i < steps.length; i++) {
    if ((steps[i].startFrame ?? Infinity) <= frame) index = i;
  }
  const progress =
    index === -1
      ? 0
      : interpolate(
          frame,
          [
            steps[index].startFrame ?? 0,
            (steps[index].startFrame ?? 0) + (steps[index].frames ?? 1),
          ],
          [0, 1],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
  return {index, progress};
};
