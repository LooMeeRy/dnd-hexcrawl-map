export const compressTokenImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(128 / img.width, 128 / img.height);
        const x = (128 / scale - img.width) / 2;
        const y = (128 / scale - img.height) / 2;
        ctx.scale(scale, scale);
        ctx.drawImage(img, x, y);
        callback(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

export function getHexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

export function pixelToHex(x, y, hexSize = 80) {
  const q = (Math.sqrt(3)/3 * x - 1/3 * y) / hexSize;
  const r = (2/3 * y) / hexSize;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - s);
  if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
  else if (r_diff > s_diff) rr = -rq - rs;
  return { q: rq, r: rr };
};
