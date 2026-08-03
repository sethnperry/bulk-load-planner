// app/calculator/terminal/labels.ts
//
// Lane/arm display labels are purely presentational -- rack_arms.lane_number/
// arm_number are always a stable 1-based physical position (left-to-right,
// top-to-bottom), never remapped. "Reversed" facilities (e.g. arms physically
// numbered 6-1 instead of 1-6, left to right) and lettered facilities are
// handled entirely by this function, so resizing a rack's lane/arm count
// never requires touching existing rows -- only new tail positions get added.

export function indexToLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

export function positionLabel(position: number, count: number, reversed: boolean, alpha: boolean): string {
  const n = reversed ? count - position + 1 : position;
  return alpha ? indexToLetter(n) : String(n);
}
