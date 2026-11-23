import { skillScoreTail, type PercentileInput } from "./skillPercentile";

self.onmessage = ({ data }: MessageEvent<PercentileInput>) => {
  try {
    self.postMessage(skillScoreTail(data));
  } catch {
    self.postMessage(null);
  }
};
