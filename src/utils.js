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
