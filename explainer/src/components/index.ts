import {TitleCard} from './TitleCard';
import {Flow} from './Flow';
import {StatCard} from './StatCard';
import {BulletList} from './BulletList';
import {BarChart} from './BarChart';
import {Graph} from './Graph';
import {Code} from './Code';
import {Trace} from './Trace';
import {Table} from './Table';
import {Sequence} from './Sequence';
import {Timeline} from './Timeline';
export const registry: Record<string, React.FC<any>> = {
  title: TitleCard,
  flow: Flow,
  stat: StatCard,
  bullets: BulletList,
  chart: BarChart,
  graph: Graph,
  code: Code,
  trace: Trace,
  table: Table,
  sequence: Sequence,
  timeline: Timeline,
};
