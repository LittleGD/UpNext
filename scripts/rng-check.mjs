import { createRng } from "../src/lib/upHeroRng.ts";
for (const seed of [12345, 1, 0, 999999]) {
  const rng = createRng(seed);
  const vals = [0,1,2,3,4].map(() => rng().toFixed(15));
  console.log(`seed ${seed}: ${vals.join(" ")}`);
}
