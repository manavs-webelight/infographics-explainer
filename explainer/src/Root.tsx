import {Composition} from 'remotion';
import {Video, calculateMetadata} from './Video';
import type {VideoProps} from './Video';

// Studio preview placeholder. Real videos pass their own scenes with
// --props=projects/<id>/scenes.json; calculateMetadata then sets the
// duration from the scene timings, so this placeholder number never matters.
const placeholder: VideoProps = {
  title: 'Preview',
  scenes: [
    {
      type: 'title',
      text: 'No script loaded',
      subtitle: 'Pass --props=projects/<id>/scenes.json',
      durationInFrames: 150,
    },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={placeholder}
    calculateMetadata={calculateMetadata}
  />
);
