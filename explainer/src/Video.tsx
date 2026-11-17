import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Fragment} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {registry} from './components';
import {theme} from './theme';

export const T = 12; // transition frames (kept in sync with pipeline/audio-timing.ts)
export const LEAD = 16; // narration starts after the incoming transition ends

export type TimedScene = {
  type: string;
  durationInFrames: number;
  audioFile?: string;
} & Record<string, unknown>;

export type VideoProps = {
  title?: string;
  scenes: TimedScene[];
};

// Transitions overlap neighbours, so total = sum of scene durations
// minus one transition duration per overlap (spec section 9).
export const totalFramesFor = (scenes: TimedScene[]): number =>
  scenes.reduce((s, x) => s + x.durationInFrames, 0) - T * Math.max(0, scenes.length - 1);

export const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({props}) => {
  const total = props.scenes?.length ? totalFramesFor(props.scenes) : 300;
  return {durationInFrames: total, props};
};

export const Video: React.FC<VideoProps> = ({scenes}) => {
  if (!scenes?.length) {
    return <AbsoluteFill style={{background: theme.bg}} />;
  }
  return (
    <TransitionSeries>
      {scenes.map((s, i) => {
        const Comp = registry[s.type];
        return (
          <Fragment key={i}>
            {i > 0 && (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({durationInFrames: T})}
              />
            )}
            <TransitionSeries.Sequence durationInFrames={s.durationInFrames}>
              <Comp {...s} />
              {s.audioFile && (
                <Sequence from={LEAD}>
                  <Audio src={staticFile(s.audioFile)} />
                </Sequence>
              )}
              {Array.isArray(s.steps) &&
                typeof s.steps[0] === 'object' &&
                (s.steps as TimedScene[]).map((st, m) =>
                  st.audioFile ? (
                    <Sequence key={m} from={Number(st.startFrame ?? LEAD)}>
                      <Audio src={staticFile(st.audioFile as string)} />
                    </Sequence>
                  ) : null,
                )}
            </TransitionSeries.Sequence>
          </Fragment>
        );
      })}
    </TransitionSeries>
  );
};
